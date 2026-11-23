import projectModel from '../models/project.model.js';
import * as projectService from '../services/project.service.js';
import userModel from '../models/user.model.js';
import { validationResult } from 'express-validator';


export const createProject = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {

        const { name } = req.body;
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser._id;

        const newProject = await projectService.createProject({ name, userId });

        res.status(201).json(newProject);

    } catch (err) {
        console.log(err);
        res.status(400).send(err.message);
    }



}

export const getAllProject = async (req, res) => {
    try {

        const loggedInUser = await userModel.findOne({
            email: req.user.email
        })

        const allUserProjects = await projectService.getAllProjectByUserId({
            userId: loggedInUser._id
        })

        return res.status(200).json({
            projects: allUserProjects
        })

    } catch (err) {
        console.log(err)
        res.status(400).json({ error: err.message })
    }
}

export const addUserToProject = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {

        const { projectId, users } = req.body

        const loggedInUser = await userModel.findOne({
            email: req.user.email
        })


        const project = await projectService.addUsersToProject({
            projectId,
            users,
            userId: loggedInUser._id
        })

        return res.status(200).json({
            project,
        })

    } catch (err) {
        console.log(err)
        res.status(400).json({ error: err.message })
    }


}

export const removeUserFromProject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const { projectId, userId: collaboratorId } = req.body;
        const project = await projectService.removeUserFromProject({
            projectId,
            collaboratorId,
            userId: req.user._id
        });
        if (!project) return res.status(404).json({ error: 'Project or collaborator not found' });

        const io = req.app.get('io');
        if (io) {
            const sockets = await io.in(projectId).fetchSockets();
            sockets.filter(socket => String(socket.user?._id) === String(collaboratorId)).forEach(socket => {
                socket.emit('project-access-revoked');
                socket.disconnect(true);
            });
        }

        return res.status(200).json({ project });
    } catch (err) {
        return res.status(403).json({ error: err.message });
    }
};

export const getProjectById = async (req, res) => {

    const { projectId } = req.params;

    try {

        const project = await projectService.getProjectById({ projectId, userId: req.user._id });
        if (!project) return res.status(404).json({ error: 'Project not found' });

        return res.status(200).json({
            project
        })

    } catch (err) {
        console.log(err)
        res.status(400).json({ error: err.message })
    }

}

export const updateFileTree = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {

        const { projectId, fileTree } = req.body;

        const project = await projectService.updateFileTree({
            projectId,
            fileTree,
            userId: req.user._id
        })
        if (!project) return res.status(404).json({ error: 'Project not found' });

        return res.status(200).json({
            project
        })

    } catch (err) {
        console.log(err)
        res.status(400).json({ error: err.message })
    }

}

export const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const project = await projectService.deleteProject({ projectId, userId: req.user._id });
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const io = req.app.get('io');
        if (io) {
            const sockets = await io.in(projectId).fetchSockets();
            sockets.forEach(socket => {
                socket.emit('project-deleted');
                socket.disconnect(true);
            });
        }
        return res.status(200).json({ success: true });
    } catch (err) {
        return res.status(403).json({ error: err.message });
    }
};

export const getProjectChatHistory = async (req, res) => {
    try {
        const messages = await projectService.getProjectChatHistory({
            projectId: req.params.projectId,
            userId: req.user._id
        });
        if (!messages) return res.status(404).json({ error: 'Project not found' });
        return res.status(200).json({ messages });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
};
