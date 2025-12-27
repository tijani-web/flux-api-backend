import dockerManager from './dockerManager.js';
import prisma from '../../config/database.js';
import codeExecutor from './codeExecutor.js';
import mockDataService from '../mockDataService.js';

/**
 * PRODUCTION SANDBOX EXECUTION SERVICE
 * - Secure code execution
 * - Resource management
 * - Execution logging
 * - Rate limiting enforcement
 * -  REAL MOCK DATA PERSISTENCE SUPPORT 
 */

class SandboxService {
  constructor() {
    this.executionStats = new Map();
    this.maxExecutionsPerUser = 1000; // Per hour
    this.saveQueue = new Map(); // Queue for saving mock data changes
  }

  // Execute endpoint code with REAL mock data saving
  async executeEndpoint(endpointId, userId, executionData) {
    console.log('🚀 SANDBOX SERVICE - executeEndpoint with REAL SAVE');
    console.log('Endpoint ID:', endpointId);
    console.log('User ID:', userId);
    console.log('Execution Data:', executionData);
    
    const dockerHealth = await dockerManager.healthCheck();
    console.log('🔍 Docker Health:', dockerHealth);
    
    const {
      body = {},
      query = {},
      params = {},
      headers = {},
      mockDataCollectionId,
      environmentId,
      timeout = 5000
    } = executionData;

    console.log('📦 Mock Data Collection ID:', mockDataCollectionId);
    console.log('🌍 Environment ID:', environmentId);

    // Check rate limits
    await this.checkRateLimit(userId);

    // Get endpoint with ALL needed data
    const endpoint = await prisma.endpoint.findUnique({
      where: { id: endpointId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true, canEdit: true }
            },
            mockData: {
              where: mockDataCollectionId ? { id: mockDataCollectionId } : undefined,
              select: {
                id: true,
                name: true,
                data: true,
                schema: true
              }
            },
            environments: {
              where: environmentId ? { id: environmentId } : { isDefault: true },
              take: 1,
              select: {
                id: true,
                name: true,
                variables: true,
                isDefault: true
              }
            }
          }
        }
      }
    });

    if (!endpoint) {
      throw new Error('ENDPOINT_NOT_FOUND');
    }

    // Validate user has access to project
    const hasAccess = 
      endpoint.project.ownerId === userId ||
      endpoint.project.collaborators.length > 0 ||
      endpoint.project.visibility === 'PUBLIC';

    if (!hasAccess) {
      throw new Error('ENDPOINT_ACCESS_DENIED');
    }

    // Validate code
    try {
      codeExecutor.validateCode(endpoint.code);
      console.log('✅ Code validation passed');
    } catch (validationError) {
      console.log('❌ Code validation failed:', validationError.message);
      await this.logExecution({
        endpointId,
        projectId: endpoint.projectId,
        userId,
        method: endpoint.method,
        path: endpoint.path,
        statusCode: 400,
        requestBody: body,
        queryParams: query,
        pathParams: params,
        headers: headers,
        responseBody: null,
        responseTime: 0,
        error: `SANDBOX_VALIDATION_FAILED: ${validationError.message}`,
        sandboxId: null
      });
      
      throw new Error(`SANDBOX_VALIDATION_FAILED: ${validationError.message}`);
    }

    const startTime = Date.now();
    let containerId;
    let executionResult;
    let saveResults = []; // Track REAL save results

    try {
      // Create execution context with REAL save capabilities
      const executionContext = this.createExecutionContext(
        endpoint, 
        { body, query, params, headers },
        endpoint.project,
        mockDataCollectionId,
        environmentId,
        endpointId,
        userId
      );

      // Create container
      containerId = await dockerManager.createContainer('node');
      console.log(`📦 Container created: ${containerId}`);

      // Execute code
      executionResult = await dockerManager.executeCode(
        containerId, 
        executionContext, 
        timeout
      );

    const executionTime = Date.now() - startTime;
     console.log(`⏱️ Execution time: ${executionTime}ms`);  

    //  Check for save operation in the response
      try {
      // Parse the execution output
      const output = this.parseOutput(executionResult.output);
      console.log('🔍 Checking for _saveOperation...');
  
      if (output && output.data && output.data._saveOperation) {
        console.log(`💾 Found save operation in response!`);
    
  const saveOp = output.data._saveOperation;
  
  // ⭐⭐ FILL IN MISSING IDs FROM EXECUTION CONTEXT ⭐⭐
  // If saveOp is missing IDs, fill them from current execution
  const completeSaveOp = {
    ...saveOp,
    // Fill collectionId if missing
    collectionId: saveOp.collectionId || mockDataCollectionId,
    // Fill endpointId if missing  
    endpointId: saveOp.endpointId || endpointId,
    // Fill userId if missing
    userId: saveOp.userId || userId,
    // Fill projectId if missing
    projectId: saveOp.projectId || endpoint.projectId
  };
  
  console.log(`📤 Processing save for ${completeSaveOp.collectionName}:`, {
    items: completeSaveOp.data.length,
    collectionId: completeSaveOp.collectionId,
    hasAllIds: !!(completeSaveOp.collectionId && completeSaveOp.endpointId && completeSaveOp.userId && completeSaveOp.projectId)
  });
    // ⭐ ACTUAL DATABASE SAVE ⭐
    const saveResult = await mockDataService.saveFromExecution(
      completeSaveOp.collectionId,
      completeSaveOp.data,
      completeSaveOp.userId,
      {
        endpointId: completeSaveOp.endpointId,
        executionId: completeSaveOp.executionId
      }
    );
    
    saveResults.push(saveResult);
    console.log(`✅ Save successful:`, saveResult.message);
  } else {
    console.log('❌ _saveOperation not found at output.data._saveOperation');
    console.log('🔍 Output structure:', {
      hasOutput: !!output,
      hasData: output ? !!output.data : false,
      dataKeys: output && output.data ? Object.keys(output.data) : []
    });
  }
} catch (error) {
  console.error(`❌ Error processing save operation:`, error);
}

      // ⭐⭐ REAL SAVE PROCESSING ⭐⭐
      // Process any save operations that were queued during execution
      if (this.saveQueue.has(containerId)) {
        const pendingSaves = this.saveQueue.get(containerId);
        console.log(`💾 Processing ${pendingSaves.length} REAL save operations...`);
        
        // Process saves sequentially
        for (const saveOp of pendingSaves) {
          try {
            console.log(`📤 Processing save for ${saveOp.collectionName}:`, {
              items: saveOp.data.length,
              collectionId: saveOp.collectionId
            });
            
            // ⭐ ACTUAL DATABASE SAVE ⭐
            const saveResult = await mockDataService.saveFromExecution(
              saveOp.collectionId,
              saveOp.data,
              userId,
              {
                endpointId: saveOp.endpointId,
                executionId: saveOp.executionId
              }
            );
            
            saveResults.push(saveResult);
            console.log(`✅ Save successful:`, saveResult.message);
            
          } catch (saveError) {
            console.error(`❌ Save operation failed:`, saveError.message);
            saveResults.push({
              success: false,
              error: saveError.message,
              collectionName: saveOp.collectionName
            });
          }
        }
        
        // Clear queue
        this.saveQueue.delete(containerId);
      }

      // Log execution
      await this.logExecution({
        endpointId,
        projectId: endpoint.projectId,
        userId,
        method: endpoint.method,
        path: endpoint.path,
        statusCode: executionResult.success ? 200 : 500,
        requestBody: body,
        queryParams: query,
        pathParams: params,
        headers: headers,
        responseBody: executionResult.success ? executionResult.output : null,
        responseTime: executionTime,
        memoryUsed: 0, 
        logs: executionResult.logs || [],
        error: executionResult.success ? null : executionResult.error,
        sandboxId: containerId,
        mockDataCollectionId,
        environmentId,
        metadata: {
          pendingSaves: saveResults.length,
          timestamp: new Date().toISOString()
        }
      });

      // Update endpoint stats
      await prisma.endpoint.update({
        where: { id: endpointId },
        data: {
          callCount: { increment: 1 },
          lastCalled: new Date()
        }
      });

      // Update user execution stats
      this.updateUserStats(userId);

      return {
        success: executionResult.success,
        data: executionResult.success ? this.parseOutput(executionResult.output) : null,
        error: executionResult.error,
        logs: executionResult.logs || [],
        executionTime,
        timestamp: new Date().toISOString(),
        savedData: saveResults.length > 0 ? {
          count: saveResults.length,
          results: saveResults
        } : null
      };

    } catch (error) {
      // Log execution error
      await this.logExecution({
        endpointId,
        projectId: endpoint.projectId,
        userId,
        method: endpoint.method,
        path: endpoint.path,
        statusCode: 500,
        requestBody: body,
        queryParams: query,
        pathParams: params,
        headers: headers,
        responseBody: null,
        responseTime: Date.now() - startTime,
        error: error.message,
        sandboxId: containerId,
        mockDataCollectionId,
        environmentId
      });

      throw error;

    } finally {
      // Cleanup container and any pending saves
      if (containerId) {
        if (this.saveQueue.has(containerId)) {
          this.saveQueue.delete(containerId);
        }
        await dockerManager.destroyContainer(containerId);
        console.log(`🧹 Container destroyed: ${containerId}`);
      }
    }
  }

  // Create execution context with REAL save capabilities
  createExecutionContext(endpoint, requestData, project, mockDataCollectionId, environmentId, endpointId, userId) {
    const { body, query, params, headers } = requestData;

    // Get specific mock data collection
    let mockDataContext = {};
    let collectionName = '';
    let collectionData = [];
    
    if (mockDataCollectionId && project.mockData && project.mockData.length > 0) {
      const collection = project.mockData.find(md => md.id === mockDataCollectionId);
      if (collection) {
        collectionName = collection.name;
        collectionData = collection.data || [];
        mockDataContext = {
          [collection.name]: collectionData
        };
        console.log(`📊 Mock data loaded: ${collection.name} (${collectionData.length} items)`);
      }
    }

    // Get specific environment
    let environmentContext = {};
    if (environmentId && project.environments && project.environments.length > 0) {
      const env = project.environments.find(e => e.id === environmentId);
      if (env) {
        environmentContext = env.variables || {};
        console.log(`🌍 Environment loaded: ${env.name} (${Object.keys(environmentContext).length} variables)`);
      }
    } else if (project.environments && project.environments.length > 0) {
      // Fallback to default
      environmentContext = project.environments[0].variables || {};
    }

    // Generate unique execution ID for tracking saves
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create the REAL execution context with ACTUAL save capabilities
    const saveFunctions = `
      // ============================================
      // 💾 REAL SAVE FUNCTIONS - QUEUED FOR PROCESSING
      // ============================================
      
      // 🚀 REAL SAVE FUNCTION (Queued for actual database save)
    const saveMockDataToDatabase = async (dataToSave, customCollectionName = null, options = {}) => {
  const collectionToUse = customCollectionName || "${collectionName}";
  const collectionIdToUse = "${mockDataCollectionId || ''}";
  const currentExecutionId = "${executionId}";
  
  console.log(\`💾 [Save Action] Collection: \${collectionToUse}, Items: \${dataToSave.length}\`);
  
  if (!collectionIdToUse) {
    console.error(\`❌ [Save Error] No collection ID specified\`);
    return {
      success: false,
      error: "No mock data collection selected. Please select a collection first.",
      collection: collectionToUse
    };
  }
  
  if (!Array.isArray(dataToSave)) {
    console.error(\`❌ [Save Error] Data must be an array\`);
    return {
      success: false,
      error: "Data to save must be an array",
      collection: collectionToUse
    };
  }
  
  try {
    // Create save operation
    const saveOperation = {
      type: 'save_mock_data',
      collectionId: collectionIdToUse,
      collectionName: collectionToUse,
      data: dataToSave,
      executionId: currentExecutionId,
      endpointId: "${endpointId}",
      userId: "${userId}",
      projectId: "${project.id}",
      timestamp: new Date().toISOString(),
      options: options
    };
    
    console.log(\`📤 [Save Operation Created] \${dataToSave.length} items for \${collectionToUse}\`);
    
    return {
      success: true,
      message: \`✅ \${dataToSave.length} items ready to save to \${collectionToUse}\`,
      collection: collectionToUse,
      itemsToSave: dataToSave.length,
      executionId: currentExecutionId,
      status: 'ready',
      // ⭐ Include the save operation data ⭐
      _saveOperation: saveOperation
    };
    
  } catch (error) {
    console.error(\`❌ [Save Failed] \${error.message}\`);
    return {
      success: false,
      error: \`Save failed: \${error.message}\`,
      collection: collectionToUse
    };
  }
};
      
      // 🔄 UPDATE AND QUEUE SAVE
      const updateAndSaveMockData = async (newData, customCollectionName = null) => {
        const collectionToUse = customCollectionName || "${collectionName}";
        
        // Update in-memory data
        mockData[collectionToUse] = newData;
        console.log(\`🔄 [Update] \${collectionToUse} updated to \${newData.length} items\`);
        
        // Queue save to database
        return await saveMockDataToDatabase(newData, collectionToUse);
      };
      
      // ➕ CREATE ITEM AND QUEUE SAVE
      const createItemAndSave = async (itemData, customCollectionName = null) => {
        const collectionToUse = customCollectionName || "${collectionName}";
        const collection = mockData[collectionToUse] || [];
        
        const newItem = {
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          ...itemData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        collection.push(newItem);
        mockData[collectionToUse] = collection;
        
        console.log(\`➕ [Create] New item added to \${collectionToUse}\`);
        
        // Queue save
        const saveResult = await saveMockDataToDatabase(collection, collectionToUse);
        
        return {
          ...saveResult,
          item: newItem
        };
      };
      
      // ✏️ UPDATE ITEM AND QUEUE SAVE
      const updateItemAndSave = async (itemId, updates, customCollectionName = null) => {
        const collectionToUse = customCollectionName || "${collectionName}";
        const collection = mockData[collectionToUse] || [];
        
        const index = collection.findIndex(item => item.id == itemId || item._id == itemId);
        if (index === -1) {
          return {
            success: false,
            error: \`Item with ID \${itemId} not found in \${collectionToUse}\`
          };
        }
        
        const updatedItem = {
          ...collection[index],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        
        collection[index] = updatedItem;
        mockData[collectionToUse] = collection;
        
        console.log(\`✏️ [Update] Item \${itemId} updated in \${collectionToUse}\`);
        
        // Queue save
        const saveResult = await saveMockDataToDatabase(collection, collectionToUse);
        
        return {
          ...saveResult,
          item: updatedItem
        };
      };
      
      // ❌ DELETE ITEM AND QUEUE SAVE
      const deleteItemAndSave = async (itemId, customCollectionName = null) => {
        const collectionToUse = customCollectionName || "${collectionName}";
        const collection = mockData[collectionToUse] || [];
        
        const index = collection.findIndex(item => item.id == itemId || item._id == itemId);
        if (index === -1) {
          return {
            success: false,
            error: \`Item with ID \${itemId} not found in \${collectionToUse}\`
          };
        }
        
        const deletedItem = collection[index];
        collection.splice(index, 1);
        mockData[collectionToUse] = collection;
        
        console.log(\`❌ [Delete] Item \${itemId} removed from \${collectionToUse}\`);
        
        // Queue save
        const saveResult = await saveMockDataToDatabase(collection, collectionToUse);
        
        return {
          ...saveResult,
          item: deletedItem
        };
      };
      
      // Make save functions globally available
      globalThis.saveMockData = saveMockDataToDatabase;
      globalThis.updateAndSave = updateAndSaveMockData;
      globalThis.createAndSave = createItemAndSave;
      globalThis.updateAndSaveItem = updateItemAndSave;
      globalThis.deleteAndSave = deleteItemAndSave;
    `;

    const contextCode = `
      // ============================================
      // 🚀 EXECUTION CONTEXT - WITH SAVE QUEUE SYSTEM
      // ============================================
      
      ${saveFunctions}
      
      // Mock Data Collections (in-memory for this execution)
      const mockData = ${JSON.stringify(mockDataContext, null, 2)};
      
      // Environment Variables
      const environment = ${JSON.stringify(environmentContext, null, 2)};
      
      // Current Collection Info
      const currentCollection = {
        name: "${collectionName}",
        id: "${mockDataCollectionId || ''}",
        itemCount: ${collectionData.length},
        canSave: ${!!mockDataCollectionId}
      };
      
      // Request Data
      const request = {
        body: ${JSON.stringify(body, null, 2)},
        query: ${JSON.stringify(query, null, 2)},
        params: ${JSON.stringify(params, null, 2)},
        headers: ${JSON.stringify(headers, null, 2)},
        collection: "${collectionName}"
      };
      
      // Helper Functions
      const Response = {
        json: (data, status = 200) => ({ 
          success: status >= 200 && status < 300,
          status,
          data,
          timestamp: new Date().toISOString()
        }),
        error: (message, status = 400) => ({ 
          success: false,
          status,
          error: message,
          timestamp: new Date().toISOString()
        }),
        success: (data) => ({ 
          success: true,
          status: 200,
          data,
          timestamp: new Date().toISOString()
        })
      };
      
      // Collection-specific helpers
      const getCollection = () => mockData["${collectionName}"] || [];
      const getCollectionByName = (name) => mockData[name] || [];
      
      // Utility Functions
      const generateId = () => Math.random().toString(36).substr(2, 9);
      const generateToken = () => 'mock_token_' + Math.random().toString(36).substr(2);
      const getTimestamp = () => new Date().toISOString();
      
      // Expose everything to user code
      Object.assign(globalThis, {
        mockData,
        environment,
        request,
        Response,
        getCollection,
        getCollectionByName,
        generateId,
        generateToken,
        getTimestamp,
        console
      });
      
      // ============================================
      // 🧪 USER CODE EXECUTION
      // ============================================
      try {
        ${endpoint.code}
      } catch (error) {
        // Wrap user errors
        throw new Error(\`[Execution Error] \${error.message}\`);
      }
    `;

    return contextCode;
  }

  // Process REAL save operation after execution
  async processSaveOperation(saveOp, userId) {
    try {
      console.log(`💾 Processing REAL save operation:`, {
        collection: saveOp.collectionName,
        items: saveOp.data.length,
        userId
      });

      // Use the mockDataService to ACTUALLY save to database
      const saveResult = await mockDataService.saveFromExecution(
        saveOp.collectionId,
        saveOp.data,
        userId,
        {
          endpointId: saveOp.endpointId,
          executionId: saveOp.executionId
        }
      );

      console.log(`✅ REAL Save completed:`, saveResult.message);
      return saveResult;

    } catch (error) {
      console.error(`❌ REAL Save operation failed:`, error);
      throw error;
    }
  }

  // Parse execution output
  parseOutput(output) {
    if (!output) return null;
    
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  // Check rate limits
  async checkRateLimit(userId) {
    const now = Date.now();
    const userStats = this.executionStats.get(userId) || { count: 0, resetTime: now + 3600000 };
    
    if (now > userStats.resetTime) {
      userStats.count = 0;
      userStats.resetTime = now + 3600000;
    }
    
    if (userStats.count >= this.maxExecutionsPerUser) {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
    
    userStats.count++;
    this.executionStats.set(userId, userStats);
  }

  // Update user execution stats
  updateUserStats(userId) {
    console.log(`📊 Execution recorded for user: ${userId}`);
  }

  // Log execution to database with FULL context
  async logExecution(logData) {
    try {
      await prisma.executionLog.create({
        data: {
          endpointId: logData.endpointId,
          projectId: logData.projectId,
          method: logData.method,
          path: logData.path,
          statusCode: logData.statusCode,
          requestBody: logData.requestBody,
          queryParams: logData.queryParams,
          pathParams: logData.pathParams,
          headers: logData.headers,
          responseBody: logData.responseBody,
          responseTime: logData.responseTime,
          memoryUsed: logData.memoryUsed,
          logs: Array.isArray(logData.logs) 
          ? logData.logs.map(log => typeof log === 'object' ? JSON.stringify(log) : String(log))
          : [],
          error: logData.error,
          sandboxId: logData.sandboxId,
          userId: logData.userId,
          mockDataCollectionId: logData.mockDataCollectionId,
          environmentId: logData.environmentId,
          metadata: logData.metadata || {}
        }
      });
    } catch (error) {
      console.error('Failed to log execution:', error);
    }
  }

  // Get execution history for endpoint
  async getExecutionHistory(endpointId, userId, limit = 20) {
    const endpoint = await prisma.endpoint.findUnique({
      where: { id: endpointId },
      include: {
        project: {
          select: {
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!endpoint || 
        (endpoint.project.ownerId !== userId && 
         endpoint.project.collaborators.length === 0)) {
      throw new Error('ACCESS_DENIED');
    }

    const history = await prisma.executionLog.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        statusCode: true,
        responseTime: true,
        error: true,
        createdAt: true,
        method: true,
        path: true,
        mockDataCollectionId: true,
        environmentId: true,
        metadata: true
      }
    });

    return history;
  }

  // System health check
  async healthCheck() {
    const dockerHealth = await dockerManager.healthCheck();
    const totalExecutions = Array.from(this.executionStats.values())
      .reduce((sum, stats) => sum + stats.count, 0);

    return {
      sandbox: {
        status: dockerHealth.status,
        activeContainers: dockerHealth.containers.total,
        maxContainers: dockerHealth.containers.max
      },
      executions: {
        totalUsers: this.executionStats.size,
        totalExecutions: totalExecutions,
        rateLimit: this.maxExecutionsPerUser,
        pendingSaves: this.saveQueue.size
      },
      system: dockerHealth.system
    };
  }
}

export default new SandboxService();