import endpointService from '../services/endpointService.js';
import { validationResult } from 'express-validator';

export const createEndpoint = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.errors = errors.array();
      return next(error);
    }

    const { projectId } = req.params;
    const endpoint = await endpointService.createEndpoint(projectId, req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Endpoint created successfully',
      data: endpoint
    });
    
  } catch (error) {
    next(error);
  }
};

export const getEndpoints = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const result = await endpointService.getProjectEndpoints(
      projectId, 
      req.user.id, 
      parseInt(page), 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const getEndpoint = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const endpoint = await endpointService.getEndpoint(endpointId, req.user.id);
    
    res.json({
      success: true,
      data: endpoint
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateEndpoint = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const updatedEndpoint = await endpointService.updateEndpoint(endpointId, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Endpoint updated successfully',
      data: updatedEndpoint
    });
    
  } catch (error) {
    next(error);
  }
};

export const deleteEndpoint = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    await endpointService.deleteEndpoint(endpointId, req.user.id);
    
    res.json({
      success: true,
      message: 'Endpoint deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const duplicateEndpoint = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const duplicatedEndpoint = await endpointService.duplicateEndpoint(endpointId, req.user.id);
    
    res.status(201).json({
      success: true,
      message: 'Endpoint duplicated successfully',
      data: duplicatedEndpoint
    });
    
  } catch (error) {
    next(error);
  }
};