const logger = require('./logger');
const SERVICE_NAME = 'TeaserPasteCLI';
const ACCOUNT_NAME = 'api_token';

let keytar;
async function getKeytar() {
    if (keytar) return keytar;
    try {
        keytar = await import('keytar');
        return keytar;
    } catch (err) {
        logger.error('Could not load keytar library. Token will not be stored securely.', err);
        return null;
    }
}
async function setToken(token) {
    logger.log(`setToken: Starting setToken function.`);
    if (typeof token !== 'string' || !token.startsWith('priv_')) {
        throw new Error('Invalid token. Private token must start with "priv_".');
    }
    const kt = await getKeytar();
    if (!kt) {
        throw new Error('Cannot save token securely.');
    }
    try {
        await kt.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
        logger.log(`setToken: Token saved to secure keychain.`);
    } catch (error) {
        logger.error('Error saving token with keytar:', error);
        throw new Error(`Could not save token: ${error.message}`);
    }
}
async function getToken() {
    logger.log(`getToken: Starting getToken function.`);
    const kt = await getKeytar();
    if (!kt) return null;
    try {
        const token = await kt.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        logger.log(`getToken: Token read from keychain is: ${token ? 'found' : 'not found'}`);
        return token;
    } catch (error) {
        logger.error('Error getting token from keytar:', error);
        return null;
    }
}
async function clearToken() {
    logger.log(`clearToken: Starting clearToken function.`);
    const kt = await getKeytar();
    if (!kt) return;
    try {
        await kt.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
        logger.log(`clearToken: Token deleted from keychain.`);
    } catch (error) {
        logger.error('Error deleting token with keytar:', error);
    }
}
module.exports = {
    setToken,
    getToken,
    clearToken
};