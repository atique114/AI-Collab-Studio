import jwt from "jsonwebtoken";
import redisClient from "../services/redis.service.js";


export const authUser = async (req, res, next) => {
    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[ 1 ];

        if (!token) {
            return res.status(401).send({ error: 'Unauthorized User' });
        }

        let isBlackListed;
        try {
            isBlackListed = await redisClient.get(token);
        } catch {
            return res.status(503).json({ error: 'Session service is unavailable. Please try again shortly.' });
        }

        if (isBlackListed) {

            res.cookie('token', '');

            return res.status(401).send({ error: 'Unauthorized User' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded._id) return res.status(401).json({ error: 'Please sign in again' });
        req.user = decoded;
        next();
    } catch {
        return res.status(401).send({ error: 'Unauthorized User' });
    }
}
