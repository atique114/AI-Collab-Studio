import mongoose from 'mongoose';

const projectMessageSchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'project',
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true,
        maxlength: 100000
    },
    sender: {
        _id: { type: String, required: true },
        email: { type: String, default: '' }
    },
    aiRequestId: { type: String, maxlength: 100 },
    inReplyTo: { type: String, maxlength: 100 }
}, { timestamps: true });

projectMessageSchema.index({ project: 1, createdAt: 1, _id: 1 });

const ProjectMessage = mongoose.model('project-message', projectMessageSchema);

export default ProjectMessage;
