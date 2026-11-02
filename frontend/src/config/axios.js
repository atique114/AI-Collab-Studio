import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim();

const axiosInstance = axios.create({
    baseURL: apiBaseUrl,
})

axiosInstance.interceptors.request.use((config) => {
    if (!apiBaseUrl) {
        throw new Error('The backend API is not configured. Set VITE_API_URL to the deployed backend URL in Vercel, then redeploy the frontend.');
    }

    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    } else {
        delete config.headers.Authorization;
    }

    return config;
});


export default axiosInstance;
