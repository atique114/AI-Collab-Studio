import mongoose from "mongoose";


async function connect() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not configured');
    }
    await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
    });
    console.log('Connected to MongoDB');
    return mongoose.connection;
}

export default connect;
