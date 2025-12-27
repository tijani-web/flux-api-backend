import prisma from '../config/database.js';

class EnvironmentService {
  async createEnvironment(projectId, userId, environmentData) {
    await this.verifyProjectAccess(projectId, userId);
    
    const environment = await prisma.environment.create({
      data: {
        projectId,
        name: environmentData.name,
        variables: environmentData.variables || {},
        isDefault: environmentData.isDefault || false
      }
    });
    
    return environment;
  }

  async getProjectEnvironments(projectId, userId) {
    await this.verifyProjectAccess(projectId, userId);
    
    const environments = await prisma.environment.findMany({
      where: { projectId },
      orderBy: { isDefault: 'desc' }
    });
    
    return environments;
  }

  async updateEnvironment(environmentId, userId, updateData) {
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      include: { project: true }
    });
    
    if (!environment) throw new Error('Environment not found');
    await this.verifyProjectAccess(environment.projectId, userId);
    
    const updatedEnv = await prisma.environment.update({
      where: { id: environmentId },
      data: updateData
    });
    
    return updatedEnv;
  }

  async deleteEnvironment(environmentId, userId) {
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
      include: { project: true }
    });
    
    if (!environment) throw new Error('Environment not found');
    await this.verifyProjectAccess(environment.projectId, userId);
    
    await prisma.environment.delete({
      where: { id: environmentId }
    });
  }

  async verifyProjectAccess(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId, canEdit: true } } }
        ]
      }
    });

    if (!project) throw new Error('Project access denied');
    return true;
  }
}

export default new EnvironmentService();