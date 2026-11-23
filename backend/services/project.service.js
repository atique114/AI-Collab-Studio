import projectModel from '../models/project.model.js';
import projectMessageModel from '../models/project-message.model.js';
import mongoose from 'mongoose';

const projectOwnerId = project => String(project.owner || project.users?.[0] || '');

const assertProjectOwner = (project, userId) => {
    if (projectOwnerId(project) !== String(userId)) {
        throw new Error('Only the project owner can manage this project');
    }
};

export const createProject = async ({
    name, userId
}) => {
    if (!name) {
        throw new Error('Name is required')
    }
    if (!userId) {
        throw new Error('UserId is required')
    }

    let project;
    try {
        project = await projectModel.create({
            name,
            owner: userId,
            users: [ userId ]
        });
    } catch (error) {
        if (error.code === 11000) {
            throw new Error('Project name already exists');
        }
        throw error;
    }

    return project;

}


export const getAllProjectByUserId = async ({ userId }) => {
    if (!userId) {
        throw new Error('UserId is required')
    }

    const allUserProjects = await projectModel.find({
        users: userId
    })

    return allUserProjects
}

export const addUsersToProject = async ({ projectId, users, userId }) => {

    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    if (!users) {
        throw new Error("users are required")
    }

    if (!Array.isArray(users) || users.some(userId => !mongoose.Types.ObjectId.isValid(userId))) {
        throw new Error("Invalid userId(s) in users array")
    }

    if (!userId) {
        throw new Error("userId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid userId")
    }


    const project = await projectModel.findById(projectId)

    if (!project) {
        throw new Error('Project not found');
    }
    assertProjectOwner(project, userId);

    const updatedProject = await projectModel.findOneAndUpdate({
        _id: projectId
    }, {
        $addToSet: {
            users: {
                $each: users
            }
        }
    }, {
        new: true
    })

    return updatedProject



}

export const getProjectById = async ({ projectId, userId }) => {
    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    const project = await projectModel.findOne({
        _id: projectId,
        users: userId
    }).populate('users', 'email')

    return project;
}

export const updateFileTree = async ({ projectId, fileTree, userId }) => {
    if (!projectId) {
        throw new Error("projectId is required")
    }

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error("Invalid projectId")
    }

    if (!fileTree) {
        throw new Error("fileTree is required")
    }

    const project = await projectModel.findOneAndUpdate({
        _id: projectId,
        users: userId
    }, {
        fileTree
    }, {
        new: true
    })

    return project;
}

export const removeUserFromProject = async ({ projectId, collaboratorId, userId }) => {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!collaboratorId || !mongoose.Types.ObjectId.isValid(collaboratorId)) {
        throw new Error('Invalid collaboratorId');
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }

    const project = await projectModel.findById(projectId);
    if (!project) return null;
    assertProjectOwner(project, userId);
    if (projectOwnerId(project) === String(collaboratorId)) {
        throw new Error('The project owner cannot be removed');
    }

    return projectModel.findOneAndUpdate({ _id: projectId, users: collaboratorId }, {
        $pull: { users: collaboratorId }
    }, { new: true }).populate('users', 'email');
}

export const deleteProject = async ({ projectId, userId }) => {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
    }

    const project = await projectModel.findById(projectId);
    if (!project) return null;
    assertProjectOwner(project, userId);

    await project.deleteOne();
    await projectMessageModel.deleteMany({ project: projectId });
    return project;
}

export const getProjectChatHistory = async ({ projectId, userId, limit = 500 }) => {
    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
        throw new Error('Invalid projectId');
    }

    const project = await projectModel.findOne({ _id: projectId, users: userId }).select('_id');
    if (!project) return null;

    const messages = await projectMessageModel.find({ project: projectId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean();
    return messages.reverse().map(message => {
        if (message.sender?._id !== 'ai') return message;
        try {
            const response = JSON.parse(message.message);
            delete response.fileTree;
            return { ...message, message: JSON.stringify(response) };
        } catch {
            return message;
        }
    });
}
