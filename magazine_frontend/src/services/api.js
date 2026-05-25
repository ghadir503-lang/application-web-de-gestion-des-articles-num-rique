import axios from "axios";

// Cree le client HTTP centralise pour communiquer avec le backend Laravel.
const api = axios.create({
  baseURL: "http://127.0.0.1:8000/api"
});

// Ajoute automatiquement le token d'authentification aux requetes API.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
