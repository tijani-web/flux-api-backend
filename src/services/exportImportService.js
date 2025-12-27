import prisma from '../config/database.js';
import documentationService from './documentationService.js';

class ExportImportService {
  // Export project to various formats
  async exportProject(projectId, userId, format = 'openapi', include = {}) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      },
      include: {
        endpoints: {
          where: { isActive: true },
          include: {
            executionLogs: {
              orderBy: { createdAt: 'desc' },
              take: 10,
              select: {
                statusCode: true,
                responseTime: true,
                createdAt: true
              }
            }
          }
        },
        mockData: true,
        environments: true
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    switch (format.toLowerCase()) {
      case 'openapi':
        return await this.exportToOpenAPI(project, include);
      
      case 'postman':
        return await this.exportToPostman(project, include);
      
      case 'insomnia':
        return await this.exportToInsomnia(project, include);
      
      case 'custom_json':
        return await this.exportToCustomJSON(project, include);
      
      default:
        throw new Error('UNSUPPORTED_EXPORT_FORMAT');
    }
  }

  // Export to OpenAPI format
  async exportToOpenAPI(project, include) {
    const openAPISpec = await documentationService.generateOpenAPISpec(project.id, project.ownerId);
    
    const exportData = {
      format: 'openapi',
      version: '3.0.0',
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        version: project.version
      },
      spec: openAPISpec
    };

    if (include.mockData) {
      exportData.mockData = project.mockData;
    }

    if (include.environments) {
      exportData.environments = project.environments;
    }

    return {
      content: JSON.stringify(exportData, null, 2),
      contentType: 'application/json',
      filename: `${project.name}-openapi.json`
    };
  }

  // Export to Postman collection
  async exportToPostman(project, include) {
    const openAPISpec = await documentationService.generateOpenAPISpec(project.id, project.ownerId);
    const postmanCollection = this.convertToPostmanCollection(openAPISpec, project);

    const exportData = {
      format: 'postman',
      version: '2.1.0',
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description
      },
      collection: postmanCollection
    };

    return {
      content: JSON.stringify(exportData, null, 2),
      contentType: 'application/json',
      filename: `${project.name}-postman.json`
    };
  }

  // Export to Insomnia format
  async exportToInsomnia(project, include) {
    const openAPISpec = await documentationService.generateOpenAPISpec(project.id, project.ownerId);
    const insomniaCollection = this.convertToInsomnia(openAPISpec, project);

    return {
      content: JSON.stringify(insomniaCollection, null, 2),
      contentType: 'application/json',
      filename: `${project.name}-insomnia.json`
    };
  }

  // Export to custom JSON format
  async exportToCustomJSON(project, include) {
    const exportData = {
      format: 'custom_json',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        version: project.version,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      },
      endpoints: project.endpoints.map(endpoint => ({
        id: endpoint.id,
        path: endpoint.path,
        method: endpoint.method,
        name: endpoint.name,
        description: endpoint.description,
        code: endpoint.code,
        headers: endpoint.headers,
        queryParams: endpoint.queryParams,
        pathParams: endpoint.pathParams,
        requestSchema: endpoint.requestSchema,
        responseSchema: endpoint.responseSchema,
        isActive: endpoint.isActive,
        callCount: endpoint.callCount,
        lastCalled: endpoint.lastCalled,
        createdAt: endpoint.createdAt,
        updatedAt: endpoint.updatedAt
      }))
    };

    if (include.mockData) {
      exportData.mockData = project.mockData;
    }

    if (include.environments) {
      exportData.environments = project.environments;
    }

    if (include.analytics) {
      exportData.analytics = {
        totalEndpoints: project.endpoints.length,
        totalCalls: project.endpoints.reduce((sum, ep) => sum + ep.callCount, 0),
        endpoints: project.endpoints.map(ep => ({
          id: ep.id,
          name: ep.name,
          callCount: ep.callCount,
          lastCalled: ep.lastCalled,
          recentExecutions: ep.executionLogs
        }))
      };
    }

    return {
      content: JSON.stringify(exportData, null, 2),
      contentType: 'application/json',
      filename: `${project.name}-export.json`
    };
  }

  // Convert OpenAPI to Postman collection
  convertToPostmanCollection(openAPISpec, project) {
    const items = [];

    Object.entries(openAPISpec.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        const item = {
          name: operation.summary || `${method.toUpperCase()} ${path}`,
          request: {
            method: method.toUpperCase(),
            header: this.generatePostmanHeaders(operation),
            url: {
              raw: `{{base_url}}${path}`,
              host: ['{{base_url}}'],
              path: path.split('/').filter(Boolean)
            },
            body: this.generatePostmanBody(operation),
            description: operation.description
          },
          response: []
        };

        items.push(item);
      });
    });

    return {
      info: {
        name: `${project.name} - API Flow Studio`,
        description: project.description || `Exported from API Flow Studio - ${project.name}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: items,
      variable: [
        {
          key: 'base_url',
          value: 'https://api.yourserver.com',
          type: 'string'
        },
        {
          key: 'api_key',
          value: 'your-api-key-here',
          type: 'string'
        }
      ]
    };
  }

  // Convert to Insomnia format
  convertToInsomnia(openAPISpec, project) {
    const resources = [];
    let resourceId = 1;

    Object.entries(openAPISpec.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        const request = {
          _id: `req_${resourceId++}`,
          _type: 'request',
          name: operation.summary || `${method.toUpperCase()} ${path}`,
          method: method.toUpperCase(),
          url: `{{ base_url }}${path}`,
          body: this.generateInsomniaBody(operation),
          headers: this.generateInsomniaHeaders(operation),
          description: operation.description
        };

        resources.push(request);
      });
    });

    // Add workspace
    resources.unshift({
      _id: 'wrk_1',
      _type: 'workspace',
      name: `${project.name} - API Flow Studio`,
      description: project.description || 'Exported from API Flow Studio',
      scope: 'collection'
    });

    // Add environment
    resources.unshift({
      _id: 'env_1',
      _type: 'environment',
      name: 'Base Environment',
      data: {
        base_url: 'https://api.yourserver.com'
      }
    });

    return {
      _type: 'export',
      __export_format: 4,
      __export_date: new Date().toISOString(),
      __export_source: 'api-flow-studio/1.0.0',
      resources
    };
  }

  // Import project from file
  async importProject(userId, fileData, options = {}) {
    try {
      const importData = JSON.parse(fileData);
      
      switch (importData.format) {
        case 'custom_json':
          return await this.importFromCustomJSON(userId, importData, options);
        
        case 'openapi':
          return await this.importFromOpenAPI(userId, importData, options);
        
        case 'postman':
          return await this.importFromPostman(userId, importData, options);
        
        default:
          throw new Error('UNSUPPORTED_IMPORT_FORMAT');
      }
    } catch (error) {
      throw new Error(`IMPORT_FAILED: ${error.message}`);
    }
  }

  // Import from custom JSON format
  async importFromCustomJSON(userId, importData, options) {
    const { project, endpoints, mockData, environments } = importData;

    // Create new project
    const newProject = await prisma.project.create({
      data: {
        name: options.name || `${project.name} (Imported)`,
        description: project.description,
        ownerId: userId,
        version: project.version || '1.0.0'
      }
    });

    // Import endpoints
    if (endpoints && Array.isArray(endpoints)) {
      for (const endpointData of endpoints) {
        await prisma.endpoint.create({
          data: {
            projectId: newProject.id,
            path: endpointData.path,
            method: endpointData.method,
            name: endpointData.name,
            description: endpointData.description,
            code: endpointData.code,
            headers: endpointData.headers || {},
            queryParams: endpointData.queryParams || {},
            pathParams: endpointData.pathParams || {},
            requestSchema: endpointData.requestSchema || {},
            responseSchema: endpointData.responseSchema || {}
          }
        });
      }
    }

    // Import mock data
    if (mockData && Array.isArray(mockData)) {
      for (const mockCollection of mockData) {
        await prisma.mockDataCollection.create({
          data: {
            projectId: newProject.id,
            name: mockCollection.name,
            description: mockCollection.description,
            schema: mockCollection.schema || {},
            data: mockCollection.data || []
          }
        });
      }
    }

    // Import environments
    if (environments && Array.isArray(environments)) {
      for (const envData of environments) {
        await prisma.environment.create({
          data: {
            projectId: newProject.id,
            name: envData.name,
            variables: envData.variables || {},
            isDefault: envData.isDefault || false
          }
        });
      }
    }

    return await prisma.project.findUnique({
      where: { id: newProject.id },
      include: {
        endpoints: true,
        mockData: true,
        environments: true
      }
    });
  }

  // Import from OpenAPI spec
  async importFromOpenAPI(userId, importData, options) {
    // Implementation for OpenAPI import
    // This would parse OpenAPI spec and create endpoints accordingly
    throw new Error('OPENAPI_IMPORT_NOT_IMPLEMENTED');
  }

  // Import from Postman collection
  async importFromPostman(userId, importData, options) {
    // Implementation for Postman import
    // This would parse Postman collection and create endpoints
    throw new Error('POSTMAN_IMPORT_NOT_IMPLEMENTED');
  }

  // Get supported export formats
  getSupportedFormats() {
    return [
      {
        id: 'openapi',
        name: 'OpenAPI 3.0',
        description: 'Standard OpenAPI specification',
        extensions: ['.json', '.yaml']
      },
      {
        id: 'postman',
        name: 'Postman Collection',
        description: 'Postman collection v2.1',
        extensions: ['.json']
      },
      {
        id: 'insomnia',
        name: 'Insomnia',
        description: 'Insomnia workspace export',
        extensions: ['.json']
      },
      {
        id: 'custom_json',
        name: 'Custom JSON',
        description: 'API Flow Studio native format',
        extensions: ['.json']
      }
    ];
  }

  // Helper methods for format conversion
  generatePostmanHeaders(operation) {
    const headers = [
      {
        key: 'Content-Type',
        value: 'application/json'
      }
    ];

    if (operation.security) {
      headers.push({
        key: 'Authorization',
        value: 'Bearer {{api_key}}',
        disabled: false
      });
    }

    return headers;
  }

  generatePostmanBody(operation) {
    if (!operation.requestBody) return;

    const example = this.generateExampleFromSchema(
      operation.requestBody.content['application/json']?.schema
    );

    return {
      mode: 'raw',
      raw: JSON.stringify(example, null, 2),
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }

  generateInsomniaHeaders(operation) {
    const headers = [];

    if (operation.security) {
      headers.push({
        name: 'Authorization',
        value: 'Bearer {{ api_key }}'
      });
    }

    headers.push({
      name: 'Content-Type',
      value: 'application/json'
    });

    return headers;
  }

  generateInsomniaBody(operation) {
    if (!operation.requestBody) return {};

    const example = this.generateExampleFromSchema(
      operation.requestBody.content['application/json']?.schema
    );

    return {
      mimeType: 'application/json',
      text: JSON.stringify(example, null, 2)
    };
  }

  generateExampleFromSchema(schema) {
    if (!schema) return {};

    switch (schema.type) {
      case 'object':
        const example = {};
        if (schema.properties) {
          Object.entries(schema.properties).forEach(([key, propSchema]) => {
            example[key] = this.generateExampleFromSchema(propSchema);
          });
        }
        return example;

      case 'array':
        return schema.items ? [this.generateExampleFromSchema(schema.items)] : [];

      case 'string':
        return 'example_string';

      case 'number':
        return 123.45;

      case 'boolean':
        return true;

      default:
        return null;
    }
  }
}

export default new ExportImportService();