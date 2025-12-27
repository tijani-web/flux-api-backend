import aiService from '../services/aiService.js';
import { validationResult } from 'express-validator';

export const generateCode = async (req, res, next) => {
  try {
    const { prompt, context } = req.body;
    
    if (!prompt) {
      const error = new Error('Prompt is required');
      error.statusCode = 400;
      return next(error);
    }

    const result = await aiService.generateEndpointCode(req.user.id, prompt, context);
    
    res.json({
      success: true,
      message: 'Code generated successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const optimizeCode = async (req, res, next) => {
  try {
    const { code, optimizationType } = req.body;
    
    if (!code) {
      const error = new Error('Code is required');
      error.statusCode = 400;
      return next(error);
    }

    const result = await aiService.optimizeCode(req.user.id, code, optimizationType);
    
    res.json({
      success: true,
      message: 'Code optimized successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const debugCode = async (req, res, next) => {
  try {
    const { code, errorMessage, context } = req.body;
    
    if (!code || !errorMessage) {
      const error = new Error('Code and error message are required');
      error.statusCode = 400;
      return next(error);
    }

    const result = await aiService.debugCode(req.user.id, code, errorMessage, context);
    
    res.json({
      success: true,
      message: 'Code debugged successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const generateTests = async (req, res, next) => {
  try {
    const { code, testFramework } = req.body;
    
    if (!code) {
      const error = new Error('Code is required');
      error.statusCode = 400;
      return next(error);
    }

    const result = await aiService.generateTests(req.user.id, code, testFramework);
    
    res.json({
      success: true,
      message: 'Tests generated successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const generateAiDocumentation = async (req, res, next) => {
  try {
    const { code, docType } = req.body;
    
    if (!code) {
      const error = new Error('Code is required');
      error.statusCode = 400;
      return next(error);
    }

    const result = await aiService.generateDocumentation(req.user.id, code, docType);
    
    res.json({
      success: true,
      message: 'Documentation generated successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const getAIUsage = async (req, res, next) => {
  try {
    const usage = await aiService.getUserUsageStats(req.user.id);
    
    res.json({
      success: true,
      data: usage
    });
    
  } catch (error) {
    next(error);
  }
};