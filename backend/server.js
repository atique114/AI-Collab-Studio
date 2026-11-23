import 'dotenv/config';
import http from 'http';
import app from './app.js';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import projectModel from './models/project.model.js';
import projectMessageModel from './models/project-message.model.js';
import { generateResult, getAiFailureMessage } from './services/ai.service.js';
import { collectFilePaths, mergeFileTrees } from './services/file-tree.service.js';
import { updateFileTree } from './services/project.service.js';
import redisClient from './services/redis.service.js';
import connect from './db/db.js';

const port = process.env.PORT || 3000;



const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});
app.set('io', io);


io.use(async (socket, next) => {

    try {

        const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[ 1 ];
        const projectId = socket.handshake.query.projectId;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return next(new Error('Invalid projectId'));
        }


        if (!token) {
            return next(new Error('Authentication error'))
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded?._id) {
            return next(new Error('Authentication error'))
        }
        if (await redisClient.get(token)) return next(new Error('Authentication error'));

        socket.project = await projectModel.findOne({ _id: projectId, users: decoded._id });
        if (!socket.project) return next(new Error('Project access denied'));


        socket.user = decoded;

        next();

    } catch (error) {
        next(error)
    }

})


io.on('connection', socket => {
    socket.roomId = socket.project._id.toString()


    console.log('a user connected');



    socket.join(socket.roomId);

    socket.on('project-message', async data => {
        const message = typeof data?.message === 'string' ? data.message.trim() : '';
        if (!message || message.length > 10000) return;
        const aiRequestId = message.includes('@ai') && typeof data?.aiRequestId === 'string'
            ? data.aiRequestId.slice(0, 100)
            : undefined;

        try {
        const currentProject = await projectModel.findOne({
            _id: socket.roomId,
            users: socket.user._id
        });
        if (!currentProject) {
            socket.emit('project-access-revoked');
            socket.disconnect(true);
            return;
        }

        const savedMessage = await projectMessageModel.create({
            project: socket.roomId,
            message,
            sender: { _id: socket.user._id, email: socket.user.email },
            aiRequestId
        });
        const payload = savedMessage.toObject();

        const aiIsPresentInMessage = message.includes('@ai');
        io.to(socket.roomId).emit('project-message', payload)

        if (aiIsPresentInMessage) {


            const prompt = message.replace('@ai', '');

            try {
                const recentMessages = await projectMessageModel.find({
                    project: socket.roomId,
                    _id: { $ne: savedMessage._id }
                }).sort({ createdAt: -1, _id: -1 }).limit(30).lean();
                recentMessages.reverse();

                const result = JSON.parse(await generateResult(prompt, {
                    existingFileTree: currentProject.fileTree || {},
                    recentMessages
                }));
                const generatedFiles = collectFilePaths(result.fileTree);
                const responseForHistory = {
                    text: result.text,
                    ...(generatedFiles.length ? { createdFiles: generatedFiles } : {})
                };
                let liveResult = responseForHistory;

                if (generatedFiles.length) {
                    const mergedFileTree = mergeFileTrees(currentProject.fileTree || {}, result.fileTree);
                    const savedProject = await updateFileTree({
                        projectId: socket.roomId,
                        userId: socket.user._id,
                        fileTree: mergedFileTree
                    });

                    if (!savedProject) throw new Error('The project could not be found while saving generated files.');

                    result.text = `${result.text.trim()}\n\nSaved to project files: ${generatedFiles.join(', ')}.`;
                    responseForHistory.text = result.text;
                    liveResult = { ...responseForHistory, fileTree: mergedFileTree };
                }

                const aiMessage = await projectMessageModel.create({
                    project: socket.roomId,
                    message: JSON.stringify(responseForHistory),
                    sender: { _id: 'ai', email: 'AI' },
                    inReplyTo: aiRequestId
                });
                io.to(socket.roomId).emit('project-message', {
                    ...aiMessage.toObject(),
                    message: JSON.stringify(liveResult)
                });
            } catch (error) {
                const aiMessage = await projectMessageModel.create({
                    project: socket.roomId,
                    message: JSON.stringify({ text: getAiFailureMessage(error) }),
                    sender: { _id: 'ai', email: 'AI' },
                    inReplyTo: aiRequestId
                });
                io.to(socket.roomId).emit('project-message', aiMessage.toObject());
                console.error('OpenAI request failed:', {
                    name: error.name,
                    code: error.code,
                    status: error.status,
                    requestId: error.request_id,
                    message: error.message,
                    cause: error.cause?.message
                });
            }


            return
        }
        } catch (error) {
            console.error('Project chat message could not be saved:', error.message);
            socket.emit('chat-error', {
                message: 'Your message could not be saved. Please try again.',
                aiRequestId
            });
        }


    })

    socket.on('disconnect', () => {
        console.log('user disconnected');
        socket.leave(socket.roomId)
    });
});




connect().then(() => {
    server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}).catch(error => {
    console.error('Backend could not start because MongoDB is unavailable:', error.message);
    process.exitCode = 1;
});
