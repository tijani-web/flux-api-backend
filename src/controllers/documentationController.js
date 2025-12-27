import DocumentationService from '../services/documentationService.js'

export const generateDocs = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const openAPISpec = await DocumentationService.generateOpenAPISpec(projectId, req.user.id);
    
    res.json({
      success: true,
      data: openAPISpec
    });
    
  } catch (error) {
    next(error);
  }
};

export const exportDocs = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { format } = req.body;
    
    const result = await DocumentationService.exportDocumentation(projectId, req.user.id, format);
    
    res.json({
      success: true,
      message: 'Documentation exported successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const getDocAnalytics = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const analytics = await DocumentationService.getDocumentationAnalytics(projectId, req.user.id);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    next(error);
  }
};