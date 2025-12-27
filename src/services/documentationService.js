import prisma from '../config/database.js';

/**
 * PRODUCTION DOCUMENTATION SERVICE
 * - Auto-generate OpenAPI/Swagger docs
 * - Interactive API documentation
 * - Export to various formats
 * - Documentation versioning
 */

class DocumentationService {
  // Generate OpenAPI specification for project
  async generateOpenAPISpec(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } },
          { visibility: 'PUBLIC' }
        ]
      },
      include: {
        endpoints: {
          where: { isActive: true },
          orderBy: { path: 'asc' }
        },
        owner: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    const basePath = this.generateBasePath(project.name);
    
    const openAPI = {
      openapi: '3.0.0',
      info: {
        title: project.name,
        description: project.description || `${project.name} API`,
        version: project.version || '1.0.0',
        contact: {
          name: project.owner.name,
          email: project.owner.email
        }
      },
      servers: [
        {
          url: `https://api.apiflowstudio.com/projects/${project.id}`,
          description: 'API Flow Studio Environment'
        }
      ],
      paths: this.generatePaths(project.endpoints),
      components: {
        schemas: this.generateSchemas(project.endpoints),
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{ bearerAuth: [] }]
    };

    return openAPI;
  }

  // Generate API paths from endpoints
  generatePaths(endpoints) {
    const paths = {};

    endpoints.forEach(endpoint => {
      const path = this.normalizePath(endpoint.path);
      
      if (!paths[path]) {
        paths[path] = {};
      }

      paths[path][endpoint.method.toLowerCase()] = {
        summary: endpoint.name || `${endpoint.method} ${endpoint.path}`,
        description: endpoint.description || '',
        operationId: this.generateOperationId(endpoint.method, endpoint.path),
        parameters: this.generateParameters(endpoint),
        requestBody: this.generateRequestBody(endpoint),
        responses: this.generateResponses(endpoint),
        tags: this.generateTags(endpoint.path)
      };
    });

    return paths;
  }

  // Generate parameters for endpoint
  generateParameters(endpoint) {
    const parameters = [];

    // Path parameters
    if (endpoint.pathParams && typeof endpoint.pathParams === 'object') {
      Object.entries(endpoint.pathParams).forEach(([name, schema]) => {
        parameters.push({
          name,
          in: 'path',
          required: true,
          schema: this.convertToOpenAPISchema(schema),
          description: `Path parameter: ${name}`
        });
      });
    }

    // Query parameters
    if (endpoint.queryParams && typeof endpoint.queryParams === 'object') {
      Object.entries(endpoint.queryParams).forEach(([name, schema]) => {
        parameters.push({
          name,
          in: 'query',
          required: false,
          schema: this.convertToOpenAPISchema(schema),
          description: `Query parameter: ${name}`
        });
      });
    }

    // Headers
    if (endpoint.headers && typeof endpoint.headers === 'object') {
      Object.entries(endpoint.headers).forEach(([name, value]) => {
        parameters.push({
          name,
          in: 'header',
          required: false,
          schema: { type: 'string', example: value },
          description: `Header: ${name}`
        });
      });
    }

    return parameters;
  }

  // Generate request body schema
  generateRequestBody(endpoint) {
    if (!endpoint.requestBody || endpoint.method === 'GET') {
      return null;
    }

    return {
      required: true,
      content: {
        'application/json': {
          schema: this.convertToOpenAPISchema(endpoint.requestBody)
        }
      }
    };
  }

  // Generate response schemas
  generateResponses(endpoint) {
    const responses = {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: endpoint.responseSchema ? 
              this.convertToOpenAPISchema(endpoint.responseSchema) : 
              { type: 'object' }
          }
        }
      },
      '400': {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      '500': {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      }
    };

    return responses;
  }

  // Generate reusable schemas
  generateSchemas(endpoints) {
    const schemas = {};

    endpoints.forEach(endpoint => {
      if (endpoint.requestBody && typeof endpoint.requestBody === 'object') {
        const schemaName = this.generateSchemaName(endpoint.path, 'Request');
        schemas[schemaName] = this.convertToOpenAPISchema(endpoint.requestBody);
      }

      if (endpoint.responseSchema && typeof endpoint.responseSchema === 'object') {
        const schemaName = this.generateSchemaName(endpoint.path, 'Response');
        schemas[schemaName] = this.convertToOpenAPISchema(endpoint.responseSchema);
      }
    });

    return schemas;
  }

  // Convert internal schema to OpenAPI schema
  convertToOpenAPISchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object' };
    }

    // If it's already an OpenAPI-like schema
    if (schema.type || schema.properties) {
      return schema;
    }

    // Infer schema from data structure
    return this.inferSchemaFromData(schema);
  }

  // Infer schema from example data
  inferSchemaFromData(data) {
    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 ? this.inferSchemaFromData(data[0]) : { type: 'object' }
      };
    }

    if (data === null) {
      return { type: 'string' };
    }

    const type = typeof data;

    switch (type) {
      case 'object':
        const properties = {};
        const required = [];

        Object.entries(data).forEach(([key, value]) => {
          properties[key] = this.inferSchemaFromData(value);
          required.push(key);
        });

        return {
          type: 'object',
          properties,
          required
        };

      case 'string':
        return { type: 'string' };

      case 'number':
        return { type: 'number' };

      case 'boolean':
        return { type: 'boolean' };

      default:
        return { type: 'string' };
    }
  }

  // Utility methods
  normalizePath(path) {
    return path.replace(/:(\w+)/g, '{$1}');
  }

  generateOperationId(method, path) {
    return `${method.toLowerCase()}${path.replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  generateTags(path) {
    const segments = path.split('/').filter(seg => seg && !seg.startsWith(':'));
    return segments.length > 0 ? [segments[0]] : ['default'];
  }

  generateSchemaName(path, suffix) {
    return `${path.replace(/[^a-zA-Z0-9]/g, '')}${suffix}`;
  }

  generateBasePath(projectName) {
    return `/api/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  // Export documentation to different formats
  async exportDocumentation(projectId, userId, format = 'openapi') {
    const openAPISpec = await this.generateOpenAPISpec(projectId, userId);

    switch (format.toLowerCase()) {
      case 'openapi':
        return {
          content: JSON.stringify(openAPISpec, null, 2),
          contentType: 'application/json',
          filename: `api-spec-${projectId}.json`
        };

      case 'yaml':
        const yaml = await this.jsonToYaml(openAPISpec);
        return {
          content: yaml,
          contentType: 'application/yaml',
          filename: `api-spec-${projectId}.yaml`
        };

      case 'postman':
        const postmanCollection = this.convertToPostman(openAPISpec, projectId);
        return {
          content: JSON.stringify(postmanCollection, null, 2),
          contentType: 'application/json',
          filename: `postman-collection-${projectId}.json`
        };

      default:
        throw new Error('UNSUPPORTED_EXPORT_FORMAT');
    }
  }

  // Convert OpenAPI to Postman collection
  convertToPostman(openAPISpec, projectId) {
    const items = [];

    Object.entries(openAPISpec.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        items.push({
          name: operation.summary,
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
        });
      });
    });

    return {
      info: {
        name: openAPISpec.info.title,
        description: openAPISpec.info.description,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: items,
      variable: [
        {
          key: 'base_url',
          value: openAPISpec.servers[0]?.url || '',
          type: 'string'
        }
      ]
    };
  }

  // Generate Postman headers
  generatePostmanHeaders(operation) {
    const headers = [
      {
        key: 'Content-Type',
        value: 'application/json'
      },
      {
        key: 'Authorization',
        value: 'Bearer {{api_key}}',
        disabled: true
      }
    ];

    return headers;
  }

  // Generate Postman request body
  generatePostmanBody(operation) {
    if (!operation.requestBody) {
      return undefined;
    }

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

  // Generate example from schema
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

  // JSON to YAML conversion (simplified)
  async jsonToYaml(jsonObj) {
    // In production, you'd use a proper YAML library like 'yaml'
    // This is a simplified version for demonstration
    const convert = (obj, indent = '') => {
      let yaml = '';
      
      if (Array.isArray(obj)) {
        obj.forEach(item => {
          yaml += `${indent}- ${convert(item, indent + '  ')}\n`;
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            yaml += `${indent}${key}:\n${convert(value, indent + '  ')}`;
          } else {
            yaml += `${indent}${key}: ${JSON.stringify(value)}\n`;
          }
        });
      } else {
        yaml += `${indent}${JSON.stringify(obj)}\n`;
      }
      
      return yaml;
    };

    return convert(jsonObj);
  }

  // Get documentation analytics
  async getDocumentationAnalytics(projectId, userId) {
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
          select: {
            id: true,
            name: true,
            path: true,
            method: true,
            description: true,
            _count: {
              select: {
                executionLogs: true
              }
            }
          }
        },
        _count: {
          select: {
            endpoints: true,
            executionLogs: true
          }
        }
      }
    });

    if (!project) {
      throw new Error('PROJECT_NOT_FOUND');
    }

    const documentedEndpoints = project.endpoints.filter(ep => 
      ep.description && ep.description.length > 0
    ).length;

    const totalExecutions = project._count.executionLogs;

    return {
      totalEndpoints: project._count.endpoints,
      documentedEndpoints,
      documentationCoverage: Math.round((documentedEndpoints / project._count.endpoints) * 100),
      totalExecutions,
      mostUsedEndpoints: project.endpoints
        .sort((a, b) => b._count.executionLogs - a._count.executionLogs)
        .slice(0, 5)
        .map(ep => ({
          name: ep.name,
          path: ep.path,
          method: ep.method,
          executions: ep._count.executionLogs
        }))
    };
  }
}

export default new DocumentationService();