// server/controllers/exportImportController.js
import exportImportService from '../services/exportImportService.js';

// Add this new function
export const getProjectExports = async (req, res, next) => {
  try {
    const { projectId } = req.query;
    const userId = req.user.id;
    
    // Check if user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'PROJECT_NOT_FOUND',
        message: 'Project not found or you do not have access'
      });
    }

    // In a real app, you'd fetch from database
    // For now, return mock data
    const exports = [
      {
        id: 'exp_1',
        projectId,
        format: 'openapi',
        filename: `api-spec-${projectId}.json`,
        downloadUrl: `/api/export-import/project/${projectId}/export?format=openapi`,
        size: '45.2 KB',
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        status: 'completed'
      },
      {
        id: 'exp_2', 
        projectId,
        format: 'postman',
        filename: `postman-${projectId}.json`,
        downloadUrl: `/api/export-import/project/${projectId}/export?format=postman`,
        size: '32.1 KB',
        createdAt: new Date(Date.now() - 172800000), // 2 days ago
        status: 'completed'
      },
      {
        id: 'exp_3',
        projectId,
        format: 'custom_json',
        filename: `backup-${projectId}.json`,
        downloadUrl: `/api/export-import/project/${projectId}/export?format=custom_json`,
        size: '67.8 KB',
        createdAt: new Date(Date.now() - 259200000), // 3 days ago
        status: 'completed'
      }
    ];

    res.json({
      success: true,
      data: exports
    });
    
  } catch (error) {
    next(error);
  }
};

// Existing functions...
export const exportProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { format, include } = req.body;
    
    const result = await exportImportService.exportProject(projectId, req.user.id, format, include);
    
    res.json({
      success: true,
      message: 'Project exported successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const importProject = async (req, res, next) => {
  try {
    const { file, options } = req.body;
    
    const project = await exportImportService.importProject(req.user.id, file, options);
    
    res.status(201).json({
      success: true,
      message: 'Project imported successfully',
      data: project
    });
    
  } catch (error) {
    next(error);
  }
};

export const getExportFormats = async (req, res, next) => {
  try {
    const formats = exportImportService.getSupportedFormats();
    
    res.json({
      success: true,
      data: formats
    });
    
  } catch (error) {
    next(error);
  }
};