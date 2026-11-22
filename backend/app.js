import express from 'express';
import morgan from 'morgan';
import userRoutes from './routes/user.routes.js';
import projectRoutes from './routes/project.routes.js';
import aiRoutes from './routes/ai.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import redisClient from './services/redis.service.js';
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/users', userRoutes);
app.use('/projects', projectRoutes);
app.use("/ai", aiRoutes)



app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/health', (req, res) => {
    const database = mongoose.connection.readyState === 1;
    const redis = redisClient.status === 'ready';
    res.status(database && redis ? 200 : 503).json({
        status: database && redis ? 'ready' : 'degraded',
        database,
        redis
    });
});

export default app; 
