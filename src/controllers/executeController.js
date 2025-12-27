import sandboxService from '../services/execution/sandboxManager.js'
import { validationResult } from 'express-validator';

// In executeController.js, in the executeEndpoint function:
export const executeEndpoint = async (req, res) => {
  console.log('\n🔍 EXECUTE ENDPOINT CONTROLLER');
  console.log('🔍 User:', req.user.id);
  console.log('🔍 Project ID:', req.params.projectId);
  console.log('🔍 Endpoint ID:', req.params.endpointId);
  console.log('🔍 Request Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const result = await sandboxService.executeEndpoint(
      req.params.endpointId,
      req.user.id,
      req.body
    );
    
    console.log('✅ Execution succeeded:', result);
    res.json({ success: true, data: result });
    
  } catch (error) {
    console.error('❌ Execution failed:', error.message);
    console.error('❌ Full error:', error);
    
    res.status(400).json({ 
      success: false, 
      error: 'SANDBOX_VALIDATION_FAILED',
      message: error.message 
    });
  }
};

export const getExecutionHistory = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const { limit = 20 } = req.query;
    
    const history = await sandboxService.getExecutionHistory(
      endpointId, 
      req.user.id, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: history
    });
    
  } catch (error) {
    next(error);
  }
};

export const getSandboxHealth = async (req, res, next) => {
  try {
    const health = await sandboxService.healthCheck();
    
    res.json({
      success: true,
      data: health
    });
    
  } catch (error) {
    next(error);
  }
};