// server/controllers/projectCollaboratorController.js
import projectCollaboratorService from '../services/projectCollaboratorService.js';
export const getCollaborators = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const collaborators = await projectCollaboratorService.getProjectCollaborators(projectId);
    
    res.json({
      success: true,
      data: collaborators
    });
    
  } catch (error) {
    next(error);
  }
};


export const sendInvitation = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, role = 'EDITOR' } = req.body;
    const userId = req.user.id;

    const result = await projectCollaboratorService.sendInvitation(
      projectId, 
      userId, 
      email, 
      role
    );

    res.json({
      success: true,
      message: 'Invitation sent successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

// Accept invitation endpoint
export const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    const collaborator = await projectCollaboratorService.acceptInvitation(token, userId);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: collaborator
    });
    
  } catch (error) {
    next(error);
  }
};

// Get pending invitations
export const getPendingInvitations = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const invitations = await projectCollaboratorService.getPendingInvitations(projectId, userId);

    res.json({
      success: true,
      data: invitations
    });
    
  } catch (error) {
    next(error);
  }
};

// CHANGE: Add collaborator directly (admin use only)
export const addCollaboratorDirect = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { userId, role = 'EDITOR' } = req.body;
    const currentUserId = req.user.id;

    const collaborator = await projectCollaboratorService.addCollaboratorDirect(
      projectId, 
      currentUserId, 
      userId, 
      role
    );

    res.json({
      success: true,
      message: 'Collaborator added successfully',
      data: collaborator
    });
    
  } catch (error) {
    next(error);
  }
};

export const removeCollaborator = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;
    const currentUserId = req.user.id;

    await projectCollaboratorService.removeCollaborator(projectId, currentUserId, userId);

    res.json({
      success: true,
      message: 'Collaborator removed successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateCollaborator = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.id;

    const updatedCollaborator = await projectCollaboratorService.updateCollaborator(
      projectId, 
      currentUserId, 
      userId, 
      role
    );

    res.json({
      success: true,
      message: 'Collaborator role updated successfully',
      data: updatedCollaborator
    });
    
  } catch (error) {
    next(error);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    const userId = req.user.id;

    if (!query || query.length < 2) {
      return res.json({
        success: true,
        data: []
      });
    }

    const users = await projectCollaboratorService.searchUsers(query, userId);

    res.json({
      success: true,
      data: users
    });
    
  } catch (error) {
    next(error);
  }
};

export const getUserPermissions = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const permissions = await projectCollaboratorService.getUserPermissions(projectId, userId);

    res.json({
      success: true,
      data: permissions
    });
    
  } catch (error) {
    next(error);
  }
};