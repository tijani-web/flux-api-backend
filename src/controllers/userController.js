import userService from '../services/userService.js';

export const getProfile = async (req, res, next) => {
  try {
    const profile = await userService.getProfile(req.user.id);
    
    res.json({
      success: true,
      data: profile
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    
    const updatedProfile = await userService.updateProfile(req.user.id, { name, avatar });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile
    });
    
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (req, res, next) => {
  try {
    await userService.deleteAccount(req.user.id);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const stats = await userService.getUserStats(req.user.id);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const { q: query } = req.query;
    
    if (!query || query.length < 2) {
      const error = new Error('Search query must be at least 2 characters');
      error.statusCode = 400;
      return next(error);
    }
    
    const users = await userService.searchUsers(query, req.user.id);
    
    res.json({
      success: true,
      data: users
    });
    
  } catch (error) {
    next(error);
  }
};