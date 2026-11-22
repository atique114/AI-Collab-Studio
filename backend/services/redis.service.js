import Redis from 'ioredis';


const redisClient = new Redis(process.env.REDIS_URL || {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
});

let errorLogged = false;
redisClient.on('error', (error) => {
    if (!errorLogged) console.error('Redis unavailable:', error.message);
    errorLogged = true;
});

redisClient.on('connect', () => {
    errorLogged = false;
    console.log('Redis connected');
})

export default redisClient;
