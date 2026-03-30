require("dotenv").config();
const { TMDBClient } = require("./tmdbClient");

// Default client using env variable (cached for reuse)
let defaultClient = null;

/**
 * Get a TMDB client instance
 * @returns {TMDBClient} - A TMDB client instance
 * @throws {Error} - If TMDB_API env variable is not set
 */
function getTmdbClient() {
    const envApiKey = process.env.TMDB_API;

    if (!envApiKey) {
        const error = new Error("TMDB_API_KEY_MISSING");
        error.userMessage = "TMDB API key must be configured on the server.";
        error.statusCode = 500;
        throw error;
    }

    if (!defaultClient) {
        defaultClient = new TMDBClient(envApiKey);
    }

    return defaultClient;
}

module.exports = { getTmdbClient };
