const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

// local strategy
exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Failed Login!',
    successRedirect: '/',
    successFlash: 'You are now logged in!'
});

exports.logout = (req, res) => {
  req.logout();
  req.flash('success', 'You are now logged out');
  res.redirect('/');
};

// middleware to check if logged in
exports.isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next(); // logged in
  }

  req.flash('error', 'You must be logged in to do that!');
  res.redirect('/login');
};

exports.forgot = async (req, res) => {
    // 1. check if that email exists
    const user = await User.findOne({ email: req.body.email });
    if (!user){
      req.flash('error', 'No account for that email exists'); // don't do this in real life
      return res.redirect('/login');
    }
    
    // 2. Set reset tokens and expiry on their account
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 360000; // 1 hour from now
    await user.save();
    
    // 3. Send them an email with the token
    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    await mail.send(
      { 
        user, // same as user: user
        subject: 'Password Reset',
        resetURL,
        filename: 'password-reset'
    });
    req.flash('success', 'You have been sent a password reset link.')

    // 4. Redirect to login page after email has been sent
    res.redirect('/login');
};

exports.reset = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    req.flash('error', 'Password reset is invalid or expired');
    return res.redirect('/login');
  }

  // show the reset password form
  res.render('reset', { title: 'Reset Password'});
};

exports.confirmedPasswords = (req, res, next) => {
  if (req.body.password == req.body['password-confirm']){
    return next();
  }
  req.flash('error', 'Passwords do not match!');
  res.redirect('back');
};

exports.update = async (req, res) => {
  const user = await User.findOne({
    resetPasswordToken: req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    req.flash('error', 'Password reset is invalid or expired');
    return res.redirect('/login');
  }

  const setPassword = promisify(user.setPassword, user);
  await setPassword(req.body.password);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  const updatedUser = await user.save();
  await req.login(updatedUser);
  req.flash('success', 'Password has been reset!');
  res.redirect('/');
};