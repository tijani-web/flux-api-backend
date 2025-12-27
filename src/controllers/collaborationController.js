import collaborationService from '../services/collaborationService.js';

export const getActiveCollaborators = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const collaborators = collaborationService.getActiveCollaborators(projectId);
    
    res.json({
      success: true,
      data: collaborators
    });
    
  } catch (error) {
    next(error);
  }
};

export const getSessionStats = async (req, res, next) => {
  try {
    const stats = collaborationService.getSessionStats();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    next(error);
  }
};