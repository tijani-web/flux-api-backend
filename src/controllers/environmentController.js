import environmentService from '../services/environmentService.js';

export const createEnvironment = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const environment = await environmentService.createEnvironment(projectId, req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Environment created successfully',
      data: environment
    });
    
  } catch (error) {
    next(error);
  }
};

export const getEnvironments = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const environments = await environmentService.getProjectEnvironments(projectId, req.user.id);
    
    res.json({
      success: true,
      data: environments
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateEnvironment = async (req, res, next) => {
  try {
    const { environmentId } = req.params;
    const updatedEnv = await environmentService.updateEnvironment(environmentId, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Environment updated successfully',
      data: updatedEnv
    });
    
  } catch (error) {
    next(error);
  }
};

export const deleteEnvironment = async (req, res, next) => {
  try {
    const { environmentId } = req.params;
    await environmentService.deleteEnvironment(environmentId, req.user.id);
    
    res.json({
      success: true,
      message: 'Environment deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};