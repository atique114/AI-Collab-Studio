import { generateResult, getAiFailureMessage } from '../services/ai.service.js';


export const getResult = async (req, res) => {
    try {
        const { prompt } = req.query;
        const result = await generateResult(prompt);
        res.send(result);
    } catch (error) {
        console.error('OpenAI request failed:', {
            name: error.name,
            code: error.code,
            status: error.status,
            requestId: error.request_id,
            message: error.message,
            cause: error.cause?.message
        });
        res.status(503).json({ message: getAiFailureMessage(error) });
    }
}
