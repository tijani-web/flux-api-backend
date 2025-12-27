import prisma from '../config/database.js';

class EndpointService {
  // Create endpoint
  async createEndpoint(projectId, userId, endpointData) {
    const { path, method, name, description, code, headers, queryParams, pathParams, requestSchema, responseSchema } = endpointData;

    // Verify project access
    await this.verifyEndpointAccess(projectId, userId, 'write');

    const endpoint = await prisma.endpoint.create({
      data: {
        projectId,
        path,
        method,
        name,
        description,
        code: code || '// Return your response here\nreturn { message: "Hello World" };',
        headers: headers || {},
        queryParams: queryParams || {},
        pathParams: pathParams || {},
        requestSchema: requestSchema || {},
        responseSchema: responseSchema || {}
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            ownerId: true
          }
        }
      }
    });

    return endpoint;
  }

  // Get project endpoints
  async getProjectEndpoints(projectId, userId, page = 1, limit = 50) {
    await this.verifyEndpointAccess(projectId, userId, 'read');

    const skip = (page - 1) * limit;

    const [endpoints, total] = await Promise.all([
      prisma.endpoint.findMany({
        where: { 
          projectId,
          isActive: true
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit
      }),
      prisma.endpoint.count({
        where: { 
          projectId,
          isActive: true
        }
      })
    ]);

    return {
      endpoints,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get endpoint by ID
  async getEndpoint(endpointId, userId) {
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
              select: { role: true }
            }
          }
        }
      }
    });

    if (!endpoint) {
      throw new Error('ENDPOINT_NOT_FOUND');
    }

    // Verify access
    await this.verifyEndpointAccess(endpoint.projectId, userId, 'read');

    return endpoint;
  }

  // Update endpoint
  async updateEndpoint(endpointId, userId, updateData) {
    const endpoint = await this.getEndpoint(endpointId, userId);
    
    // Verify write access
    await this.verifyEndpointAccess(endpoint.projectId, userId, 'write');

    const updatedEndpoint = await prisma.endpoint.update({
      where: { id: endpointId },
      data: updateData
    });

    return updatedEndpoint;
  }

  // Delete endpoint (soft delete)
  async deleteEndpoint(endpointId, userId) {
    const endpoint = await this.getEndpoint(endpointId, userId);
    
    // Verify write access
    await this.verifyEndpointAccess(endpoint.projectId, userId, 'write');

    await prisma.endpoint.update({
      where: { id: endpointId },
      data: { isActive: false }
    });

    return { success: true };
  }

  // Duplicate endpoint
  async duplicateEndpoint(endpointId, userId) {
    const endpoint = await this.getEndpoint(endpointId, userId);
    
    // Verify write access
    await this.verifyEndpointAccess(endpoint.projectId, userId, 'write');

    const duplicatedEndpoint = await prisma.endpoint.create({
      data: {
        projectId: endpoint.projectId,
        path: endpoint.path + '-copy',
        method: endpoint.method,
        name: endpoint.name + ' (Copy)',
        description: endpoint.description,
        code: endpoint.code,
        headers: endpoint.headers,
        queryParams: endpoint.queryParams,
        pathParams: endpoint.pathParams,
        requestSchema: endpoint.requestSchema,
        responseSchema: endpoint.responseSchema
      }
    });

    return duplicatedEndpoint;
  }

  // Verify endpoint access
  async verifyEndpointAccess(projectId, userId, accessType = 'read') {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { 
            collaborators: { 
              some: { 
                userId: userId,
                ...(accessType === 'write' && { canEdit: true })
              }
            }
          }
        ]
      }
    });

    if (!project) {
      throw new Error('ENDPOINT_ACCESS_DENIED');
    }

    return true;
  }

  // Update endpoint call statistics
  async updateEndpointStats(endpointId, statusCode, responseTime) {
    await prisma.endpoint.update({
      where: { id: endpointId },
      data: {
        callCount: { increment: 1 },
        lastCalled: new Date()
      }
    });

    // You could also store more detailed analytics here
  }

  // Validate endpoint code syntax (basic validation)
  validateEndpointCode(code) {
    if (!code || typeof code !== 'string') {
      throw new Error('INVALID_CODE');
    }

    if (code.length > 10000) {
      throw new Error('CODE_TOO_LONG');
    }

    // Basic syntax checks could be added here
    return true;
  }
}

export default new EndpointService();