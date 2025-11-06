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
        logger.error('Không thể tải thư viện keytar. Token sẽ không được lưu trữ an toàn.', err);
        return null;
    }
}
async function setToken(token) {
    logger.log(`setToken: Bắt đầu hàm setToken.`);
    if (typeof token !== 'string' || !token.startsWith('priv_')) {
        throw new Error('Token không hợp lệ. Private token phải bắt đầu bằng "priv_".');
    }
    const kt = await getKeytar();
    if (!kt) {
        throw new Error('Không thể lưu token một cách an toàn.');
    }
    try {
        await kt.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
        logger.log(`setToken: Đã lưu token vào kho khóa an toàn.`);
    } catch (error) {
        logger.error('Lỗi khi lưu token bằng keytar:', error);
        throw new Error(`Không thể lưu token: ${error.message}`);
    }
}
async function getToken() {
    logger.log(`getToken: Bắt đầu hàm getToken.`);
    const kt = await getKeytar();
    if (!kt) return null;
    try {
        const token = await kt.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        logger.log(`getToken: Token được đọc từ kho khóa là: ${token ? 'đã tìm thấy' : 'không có'}`);
        return token;
    } catch (error) {
        logger.error('Lỗi khi lấy token từ keytar:', error);
        return null;
    }
}
async function clearToken() {
    logger.log(`clearToken: Bắt đầu hàm clearToken.`);
    const kt = await getKeytar();
    if (!kt) return;
    try {
        await kt.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
        logger.log(`clearToken: Đã xóa token khỏi kho khóa.`);
    } catch (error) {
        logger.error('Lỗi khi xóa token bằng keytar:', error);
    }
}
module.exports = {
    setToken,
    getToken,
    clearToken
};