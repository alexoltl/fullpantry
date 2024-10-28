function checkLoginStatus(req) {
    return req.session && req.session.isLoggedIn && req.session.username;
}

module.exports = checkLoginStatus;