import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import db from '../db.js'; // Corrected Knex configuration path

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // Check if user exists
  const userExists = await db('users').where({ email }).first();

  if (userExists) {
    return res.render('register', {
      title: 'Register',
      error: 'User already exists',
      values: { name, email },
    });
  }

  // Create user
  const [userId] = await db('users').insert({
    name,
    email,
    password, // Ensure password is hashed before saving
  });

  if (userId) {
    // Generate token
    const token = generateToken(userId);

    // Set session
    req.session.user = {
      id: userId,
      name,
      email,
      role: 'user', // Default role
    };

    res.redirect('/documents');
  } else {
    res.render('register', {
      title: 'Register',
      error: 'Invalid user data',
      values: { name, email },
    });
  }
});

// @desc    Authenticate user & get token
// @route   POST /login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await db('users').where({ email }).first();

  // Check if user exists and password matches
  if (user && (await db('users').where({ email, password }).first())) {
    // Generate token
    const token = generateToken(user.id);

    // Set session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.redirect('/documents');
  } else {
    res.render('login', {
      title: 'Login',
      error: 'Invalid email or password',
      values: { email },
    });
  }
});

// @desc    Logout user
// @route   GET /logout
// @access  Private
const logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
};

// @desc    Render login page
// @route   GET /login
// @access  Public
const getLoginPage = (req, res) => {
  if (req.session.user) {
    return res.redirect('/documents');
  }
  res.render('login', { title: 'Login', error: null, values: {} });
};

// @desc    Render register page
// @route   GET /register
// @access  Public
const getRegisterPage = (req, res) => {
  if (req.session.user) {
    return res.redirect('/documents');
  }
  res.render('register', { title: 'Register', error: null, values: {} });
};

export { registerUser, loginUser, logoutUser, getLoginPage, getRegisterPage };