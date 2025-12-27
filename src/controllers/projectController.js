import prisma from '../config/database.js';
import { validationResult } from 'express-validator';
import projectService from '../services/projectService.js';
import { ProjectExportImportService } from '../services/ProjectExportImportService.js';

// Initialize service instance
const projectExportImportService = new ProjectExportImportService();

// ===== PROJECT CRUD =====
export const createProject = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const project = await projectService.createProject(req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
    
  } catch (error) {
    next(error);
  }
};

export const getProjects = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const result = await projectService.getUserProjects(
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

export const getProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await projectService.getProject(projectId, req.user.id);
    
    res.json({
      success: true,
      data: project
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const updatedProject = await projectService.updateProject(
      projectId, 
      req.user.id, 
      req.body
    );
    
    res.json({
      success: true,
      message: 'Project updated successfully',
      data: updatedProject
    });
    
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await projectService.deleteProject(projectId, req.user.id);
    
    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

// ===== EXPORT PROJECT =====
export const exportProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { format = 'CUSTOM_JSON', include = {} } = req.body;
    
    // Validate format
    const validFormats = ['CUSTOM_JSON', 'POSTMAN', 'OPENAPI', 'INSOMNIA'];
    const formatUpper = format.toUpperCase();
    
    if (!validFormats.includes(formatUpper)) {
      return res.status(400).json({
        success: false,
        message: `Invalid format. Must be one of: ${validFormats.join(', ')}`
      });
    }
    
    // Call service to export project
    const result = await projectExportImportService.exportProject(
      projectId,
      req.user.id,
      {
        format: formatUpper,
        include: {
          endpoints: include.endpoints ?? true,
          mockData: include.mockData ?? true,
          environments: include.environments ?? true,
          webhooks: include.webhooks ?? false
        }
      }
    );
    
    // Send file as download
    const contentType = formatUpper === 'OPENAPI' 
      ? 'application/yaml' 
      : 'application/json';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Export-ID', result.exportId || '');
    
    res.send(result.content);
    
  } catch (error) {
    if (error.message === 'PROJECT_NOT_FOUND' || error.message === 'ACCESS_DENIED') {
      return res.status(403).json({
        success: false,
        message: 'Project not found or access denied'
      });
    }
    
    if (error.code === 'P2003') { 
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }
    
    console.error('Export error:', error);
    next(error);
  }
};

// ===== IMPORT PROJECT =====
export const importProject = async (req, res, next) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload a file.'
      });
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    
    const { name, visibility = 'PRIVATE' } = req.body;
    
    // Validate visibility
    const validVisibilities = ['PRIVATE', 'TEAM', 'PUBLIC'];
    if (!validVisibilities.includes(visibility)) {
      return res.status(400).json({
        success: false,
        message: `Invalid visibility. Must be one of: ${validVisibilities.join(', ')}`
      });
    }
    
    // Validate name
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Project name is required'
      });
    }
    
    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Project name must be less than 100 characters'
      });
    }
    
    const project = await projectExportImportService.importProject(
      req.user.id,
      req.file,
      { 
        name: name.trim(),
        visibility 
      }
    );
    
    res.status(201).json({
      success: true,
      message: 'Project imported successfully',
      data: project
    });
    
  } catch (error) {
    console.error('Import error:', error);
    
    // Handle specific errors
    if (error.message.includes('Invalid') || 
        error.message.includes('INVALID') || 
        error.message.includes('invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Invalid file format'
      });
    }
    
    if (error.code === 'P2002') { // Prisma unique constraint error
      return res.status(409).json({
        success: false,
        message: 'A project with a similar name already exists. Please use a different name.'
      });
    }
    
    if (error.name === 'SyntaxError' || error.message.includes('JSON') || error.message.includes('parse')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file format. Please upload a valid JSON or YAML file.'
      });
    }
    
    next(error);
  }
};

// ===== LIST EXPORTS =====
export const getProjectExports = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { limit = 20 } = req.query;
    
    // Verify project access first
    const hasAccess = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: req.user.id },
          {
            collaborators: {
              some: { 
                userId: req.user.id,
                role: { in: ['VIEWER', 'EDITOR', 'ADMIN'] }
              }
            }
          }
        ]
      }
    });
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const exports = await prisma.projectExport.findMany({
      where: {
        projectId,
        userId: req.user.id
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit), 100), // Max 100
      select: {
        id: true,
        format: true,
        status: true,
        fileUrl: true,
        createdAt: true,
        project: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });
    
    res.json({
      success: true,
      data: exports
    });
    
  } catch (error) {
    next(error);
  }
};

// ===== COLLABORATION MANAGEMENT =====
export const addCollaborator = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { userId, role = 'EDITOR', canEdit = true, canInvite = false } = req.body;
    
    const collaborator = await projectService.addCollaborator(
      projectId, 
      req.user.id, 
      { userId, role, canEdit, canInvite }
    );
    
    res.status(201).json({
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
    await projectService.removeCollaborator(projectId, req.user.id, userId);
    
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
    const updatedCollaborator = await projectService.updateCollaborator(
      projectId, 
      req.user.id, 
      userId, 
      req.body
    );
    
    res.json({
      success: true,
      message: 'Collaborator updated successfully',
      data: updatedCollaborator
    });
    
  } catch (error) {
    next(error);
  }
};

export const getProjectActivity = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { limit = 20 } = req.query;
    
    const activity = await projectService.getProjectActivity(
      projectId, 
      req.user.id, 
      Math.min(parseInt(limit), 100)
    );
    
    res.json({
      success: true,
      data: activity
    });
    
  } catch (error) {
    next(error);
  }
};