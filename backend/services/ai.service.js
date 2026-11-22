import OpenAI from "openai";
import { collectFilePaths, mergeFileTrees } from "./file-tree.service.js";

const systemInstructions = `You are the AI coding assistant inside AI Collab Studio. Help users understand software and create or update project files when asked.

Always return data matching the supplied JSON schema. The "files" field is always required. When the user asks you to create, write, generate, or change code or files, "files" MUST contain the requested relative paths and complete file contents. Use an empty "files" array only for questions that do not request file changes. Never say that you created or saved a file unless the response includes that file in "files". The server saves valid generated files into the current project. Do not wrap the JSON in Markdown fences.

Represent files as { "path": "src/App.jsx", "contents": "complete file contents" }. The current project file paths are supplied with each request; preserve existing files and return only files to add or update. Keep generated projects modular, runnable, and consistent with the user's requested stack. Include any required package.json and start script when creating a runnable Node.js project. Explain assumptions or setup steps in the "text" field.`;

const responseSchema = {
    type: 'object',
    properties: {
        text: { type: 'string' },
        files: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    path: { type: 'string' },
                    contents: { type: 'string' }
                },
                required: ['path', 'contents'],
                additionalProperties: false
            }
        }
    },
    required: ['text', 'files'],
    additionalProperties: false
};

export function isFileChangeRequest(prompt) {
    const text = String(prompt || '').trim();
    if (!text || /^(where|which|what|when|why|how)\b/i.test(text)) return false;
    if (/\b(?:did|have|has|was|were)\s+you\s+(?:already\s+)?(?:create|write|make|save)\b/i.test(text)) return false;

    const requestsChange = /\b(?:create|generate|write|build|make|implement|add|edit|modify|update|refactor|fix|improve|optimize|design)\b/i.test(text);
    const mentionsArtifact = /\b(?:file|files|code|component|dashboard|app|webapp|ui|interface|layout|style|styling|page|website|script|project|jsx|tsx|html|css)\b|\.[a-z\d]{1,8}\b/i.test(text);
    return requestsChange && mentionsArtifact;
}

function createClient() {
    const apiKey = process.env.GPT_AI_KEY?.trim();
    if (!apiKey) {
        const error = new Error("GPT_AI_KEY is not configured.");
        error.code = "AI_KEY_MISSING";
        throw error;
    }

    return new OpenAI({ apiKey, maxRetries: 1, timeout: 120000 });
}

export function getAiFailureMessage(error) {
    const message = [error?.message, error?.cause?.message].filter(Boolean).join(" ");
    const code = String(error?.code || "").toLowerCase();
    const status = Number(error?.status || error?.response?.status || message.match(/\[(\d{3})\s/)?.[1]);

    if (error?.code === "AI_KEY_MISSING") {
        return "OpenAI is not configured. Add GPT_AI_KEY to the backend environment and restart the server.";
    }

    if (code === "insufficient_quota" || /insufficient_quota|billing.*(?:disabled|limit|credits)|quota.*exceed/i.test(message)) {
        return "The OpenAI API project has no available quota. Check its billing status and usage limits.";
    }

    if (status === 401 || code === "invalid_api_key") {
        return "OpenAI rejected the configured API key. Check GPT_AI_KEY in the backend environment.";
    }

    if (status === 403 || status === 404 || code === "model_not_found") {
        return "The OpenAI project cannot access the configured model. Check GPT_AI_MODEL and model access for this project.";
    }

    if (status === 429) {
        return "The OpenAI API rate limit was reached. Wait briefly and try again.";
    }

    if (status === 400) {
        return "OpenAI rejected the request format. Try again, and contact the project maintainer if this continues.";
    }

    if (status >= 500) {
        return "The OpenAI API is temporarily unavailable. Try again shortly.";
    }

    if (/timeout|timed out|operation was aborted/i.test(message)) {
        return "OpenAI took too long to respond. Try again with a smaller request.";
    }

    if (/connection error|fetch failed|network error|econn(?:refused|reset|aborted)|enotfound|eai_again|etimedout|socket hang up|network socket disconnected/i.test(message)) {
        return "The backend could not connect to OpenAI. Check its outbound network, DNS, firewall, or proxy access, then retry.";
    }

    if (error?.code === "AI_RESPONSE_INCOMPLETE") {
        return "The AI response was incomplete. Please shorten the request and try again.";
    }

    if (error?.code === "AI_RESPONSE_MISSING_FILES") {
        return "The assistant did not return any project files, so nothing was saved. Try again with a filename and what it should do.";
    }

    return "OpenAI could not complete the request. Check the backend logs and try again.";
}

async function requestOpenAi(prompt, existingFilePaths, correction = '') {
    const fileContext = existingFilePaths.length
        ? existingFilePaths.map(path => `- ${path}`).join('\n')
        : '- (none yet)';
    const input = [
        `User request:\n${prompt}`,
        `Current project file paths:\n${fileContext}`,
        'Return one object matching the required schema. Put complete generated files in the files array as path and contents pairs.',
        correction
    ].filter(Boolean).join('\n\n');

    const response = await createClient().responses.create({
        model: process.env.GPT_AI_MODEL?.trim() || "gpt-6-luna",
        instructions: systemInstructions,
        input,
        text: {
            format: {
                type: 'json_schema',
                name: 'ai_collab_response',
                strict: true,
                schema: responseSchema
            }
        }
    });

    if (response.status !== "completed" || !response.output_text) {
        const error = new Error("OpenAI returned an incomplete response.");
        error.code = "AI_RESPONSE_INCOMPLETE";
        throw error;
    }

    let result;
    try {
        result = JSON.parse(response.output_text);
    } catch {
        const error = new Error("OpenAI returned invalid JSON.");
        error.code = "AI_RESPONSE_INCOMPLETE";
        throw error;
    }

    if (typeof result?.text !== 'string' || !Array.isArray(result.files)) {
        const error = new Error("OpenAI response does not match the required file response schema.");
        error.code = "AI_RESPONSE_INCOMPLETE";
        throw error;
    }

    const fileTree = result.files.reduce((tree, file) => {
        if (typeof file?.path !== 'string' || typeof file?.contents !== 'string') return tree;
        return mergeFileTrees(tree, {
            [file.path]: { file: { contents: file.contents } }
        });
    }, {});

    return {
        text: result.text,
        ...(collectFilePaths(fileTree).length ? { fileTree } : {})
    };
}

export const generateResult = async (prompt, { existingFileTree = {} } = {}) => {
    const existingFilePaths = collectFilePaths(existingFileTree);
    const needsFiles = isFileChangeRequest(prompt);
    let result = await requestOpenAi(prompt, existingFilePaths);

    if (needsFiles && !collectFilePaths(result.fileTree).length) {
        result = await requestOpenAi(
            prompt,
            existingFilePaths,
            'Your previous response omitted the requested files. Retry the user request now. Include every requested file with complete contents in the files array. Do not claim a file was created unless that file is included.'
        );
    }

    if (needsFiles && !collectFilePaths(result.fileTree).length) {
        const error = new Error('OpenAI did not return file contents for a file creation request.');
        error.code = 'AI_RESPONSE_MISSING_FILES';
        throw error;
    }

    return JSON.stringify(result);
};
