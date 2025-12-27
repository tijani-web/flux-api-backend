import mockDataService from '../services/mockDataService.js';
import { validationResult } from 'express-validator';


export const createCollection = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const collection = await mockDataService.createCollection(projectId, req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      data: collection
    });
    
  } catch (error) {
    next(error);
  }
};

export const getCollections = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const collections = await mockDataService.getProjectCollections(projectId, req.user.id);
    
    res.json({
      success: true,
      data: collections
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateCollection = async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const updatedCollection = await mockDataService.updateCollection(collectionId, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Collection updated successfully',
      data: updatedCollection
    });
    
  } catch (error) {
    next(error);
  }
};

export const deleteCollection = async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    await mockDataService.deleteCollection(collectionId, req.user.id);
    
    res.json({
      success: true,
      message: 'Collection deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const searchCollection = async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const { q: query, ...filters } = req.query;
    
    const result = await mockDataService.searchCollection(collectionId, req.user.id, query, filters);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};


// Save mock data from endpoint execution
export const saveFromExecution = async (req, res, next) => {
  try {
    console.log('💾 [Controller] Saving mock data from execution');
    
    const { collectionId, data, executionContext } = req.body;
    const userId = req.user.id;

    if (!collectionId) {
      return res.status(400).json({
        success: false,
        error: 'collectionId is required'
      });
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({
        success: false,
        error: 'data must be an array'
      });
    }

    console.log('📊 Save request details:', {
      collectionId,
      dataLength: data.length,
      userId,
      executionContext: executionContext || {}
    });

    // Call the new service method
    const result = await mockDataService.saveFromExecution(
      collectionId,
      data,
      userId,
      executionContext
    );

    console.log('✅ Save successful:', result.message);

    return res.json({
      success: true,
      message: result.message,
      data: result
    });

  } catch (error) {
    console.error('❌ [Controller] Save failed:', error.message);
    next(error);
  }
};

// Get save history for a collection
export const getSaveHistory = async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const history = await mockDataService.getSaveHistory(collectionId, userId, limit);

    return res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('❌ Failed to get save history:', error);
    next(error);
  }
};

// Rollback collection to previous version
export const rollbackCollection = async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const { version } = req.body;
    const userId = req.user.id;

    const result = await mockDataService.rollbackCollection(collectionId, userId, version);

    return res.json({
      success: true,
      message: result.message,
      data: result
    });

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    next(error);
  }
};

