/**
 * HTTP and CORS helper utilities for Netlify Serverless Functions.
 */

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

/**
 * Handle preflight OPTIONS request.
 * @param {string} allowedMethods
 * @returns {Object} Netlify HTTP response
 */
function handleCorsPreflight(allowedMethods = 'GET, POST, OPTIONS') {
  return {
    statusCode: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': allowedMethods
    },
    body: ''
  };
}

/**
 * Build standard JSON response.
 * @param {number} statusCode
 * @param {Object} data
 * @returns {Object} Netlify HTTP response
 */
function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

module.exports = {
  CORS_HEADERS,
  handleCorsPreflight,
  jsonResponse
};
