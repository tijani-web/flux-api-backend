// services/ProjectExportImportService.js
import prisma from '../config/database.js';

export class ProjectExportImportService {
  
  // ===== EXPORT =====
async exportProject(projectId, userId, options = {}) {
  const { format = 'CUSTOM_JSON', include = {} } = options;
  
  // 1. Get project with relations
  const project = await this.getProjectForExport(projectId, userId, include);
  
  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }
  
  // 2. Build export data
  const exportData = this.buildExportData(project, format, include);
  
  // 3. Convert to file
  const fileContent = this.formatExport(exportData, format);
  
  // 4. CREATE THE EXPORT RECORD IN DATABASE 
  const exportRecord = await prisma.projectExport.create({
    data: {
      projectId,
      userId,
      format: format,
      include: include,
      fileUrl: null, // You might want to save the file somewhere
      status: 'COMPLETED'
    }
  });
  
  console.log('✅ Export record created:', exportRecord.id);
  
  // 5. Return file info with export ID
  return {
    filename: `${project.name}-export.${format === 'OPENAPI' ? 'yaml' : 'json'}`,
    content: fileContent,
    format,
    size: Buffer.byteLength(fileContent, 'utf8'),
    exportId: exportRecord.id // Make sure to return this!
  };
}
  
  
  // ===== IMPORT =====
  async importProject(userId, file, options = {}) {
    const { name, visibility = 'PRIVATE' } = options;
    
    // 1. Parse file based on format
    const importData = this.parseImportFile(file);
    
    // 2. Validate and transform
    const projectData = this.transformImportData(importData, userId);
    
    // 3. Create project with all relations
    const newProject = await this.createProjectFromImport(userId, projectData, {
      name: name || projectData.project.name,
      visibility
    });
    
    return newProject;
  }
  
  // ===== HELPERS =====
  async getProjectForExport(projectId, userId, include) {
    const includes = {
      endpoints: include.endpoints || false,
      mockData: include.mockData || false,
      environments: include.environments || false,
      webhooks: include.webhooks || false
    };
    
    // Check if user has access to project
    const hasAccess = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          {
            collaborators: {
              some: { userId }
            }
          }
        ]
      }
    });
    
    if (!hasAccess) {
      throw new Error('ACCESS_DENIED');
    }
    
    return prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        endpoints: includes.endpoints,
        mockData: includes.mockData,
        environments: includes.environments,
        webhooks: includes.webhooks
      }
    });
  }
  
  buildExportData(project, format, include) {
    if (format === 'OPENAPI') {
      return this.buildOpenAPI(project, include);
    } else if (format === 'POSTMAN') {
      return this.buildPostman(project, include);
    } else {
      // JSON format
      return {
        project: {
          name: project.name,
          description: project.description,
          visibility: project.visibility,
          settings: project.settings
        },
        endpoints: include.endpoints ? project.endpoints : [],
        mockData: include.mockData ? project.mockData : [],
        environments: include.environments ? project.environments : [],
        webhooks: include.webhooks ? project.webhooks : []
      };
    }
  }
  
  buildOpenAPI(project, include) {
    const paths = {};
    
    if (project.endpoints && include.endpoints) {
      project.endpoints.forEach(endpoint => {
        if (!paths[endpoint.path]) {
          paths[endpoint.path] = {};
        }
        
        paths[endpoint.path][endpoint.method.toLowerCase()] = {
          summary: endpoint.name,
          description: endpoint.description || '',
          responses: {
            "200": {
              description: "Success"
            }
          }
        };
      });
    }
    
    return {
      openapi: "3.0.3",
      info: {
        title: project.name,
        description: project.description || '',
        version: "1.0.0"
      },
      paths
    };
  }
  
  buildPostman(project, include) {
    const items = [];
    
    if (project.endpoints && include.endpoints) {
      project.endpoints.forEach(endpoint => {
        items.push({
          name: endpoint.name,
          request: {
            method: endpoint.method,
            url: {
              raw: `{{base_url}}${endpoint.path}`,
              host: ["{{base_url}}"],
              path: endpoint.path.split('/').filter(Boolean)
            }
          }
        });
      });
    }
    
    return {
      info: {
        name: project.name,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: items
    };
  }
  
  formatExport(data, format) {
    if (format === 'OPENAPI') {
      return this.convertToYAML(data);
    }
    return JSON.stringify(data, null, 2);
  }
  
  convertToYAML(obj) {
    // Simple YAML conversion (use yaml library in production)
    const jsonString = JSON.stringify(obj, null, 2);
    return jsonString
      .replace(/^(\s+)"(\w+)":/gm, '$1$2:') // Remove quotes from keys
      .replace(/"/g, "'"); // Replace double quotes with single quotes
  }
  
  parseImportFile(file) {
    const content = file.buffer.toString('utf8');
    
    // Try to detect format
    if (content.trim().startsWith('openapi:')) {
      return { format: 'OPENAPI', data: this.parseYAML(content) };
    } else if (content.includes('"info"') && content.includes('"schema"')) {
      return { format: 'POSTMAN', data: JSON.parse(content) };
    } else {
      return { format: 'CUSTOM_JSON', data: JSON.parse(content) };
    }
  }
  
  parseYAML(yaml) {
    // Simple YAML parser (use yaml library in production)
    try {
      // Convert YAML to JSON-like object (simplified)
      const lines = yaml.split('\n');
      const result = {};
      let currentObj = result;
      let path = [];
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        
        const match = line.match(/^(\s*)(\w+):\s*(.*)$/);
        if (match) {
          const [, indent, key, value] = match;
          const depth = indent.length / 2;
          
          // Navigate to correct depth
          while (path.length > depth) {
            path.pop();
          }
          
          let target = result;
          path.forEach(p => {
            target = target[p];
          });
          
          if (value === '' || value.trim() === '') {
            target[key] = {};
            path.push(key);
          } else {
            target[key] = value;
          }
        }
      });
      
      return result;
    } catch (error) {
      console.error('YAML parse error:', error);
      return {};
    }
  }
  
  transformImportData(importData, userId) {
    if (importData.format === 'OPENAPI') {
      return this.transformOpenAPI(importData.data, userId);
    } else if (importData.format === 'POSTMAN') {
      return this.transformPostman(importData.data, userId);
    } else {
      return importData.data;
    }
  }
  
  transformOpenAPI(openapi, userId) {
    const endpoints = [];
    
    if (openapi.paths) {
      Object.entries(openapi.paths).forEach(([path, methods]) => {
        Object.entries(methods).forEach(([method, config]) => {
          if (typeof config === 'object') {
            endpoints.push({
              path,
              method: method.toUpperCase(),
              name: config.summary || `${method.toUpperCase()} ${path}`,
              description: config.description || ''
            });
          }
        });
      });
    }
    
    return {
      project: {
        name: openapi.info?.title || 'Imported API',
        description: openapi.info?.description || '',
        settings: {}
      },
      endpoints
    };
  }
  
  transformPostman(postman, userId) {
    const endpoints = [];
    
    const extractItems = (items) => {
      items?.forEach(item => {
        if (item.request) {
          const url = item.request.url;
          const path = url?.path ? '/' + url.path.join('/') : '/';
          
          endpoints.push({
            path,
            method: item.request.method || 'GET',
            name: item.name,
            description: ''
          });
        }
        if (item.item) {
          extractItems(item.item);
        }
      });
    };
    
    extractItems(postman.item);
    
    return {
      project: {
        name: postman.info?.name || 'Imported Collection',
        description: '',
        settings: {}
      },
      endpoints
    };
  }
  
  async createProjectFromImport(userId, projectData, options) {
    // Generate unique slug
    const baseSlug = options.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    
    const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Create project
    const project = await prisma.project.create({
      data: {
        name: options.name,
        description: projectData.project.description || '',
        visibility: options.visibility,
        slug: uniqueSlug,
        ownerId: userId,
        settings: projectData.project.settings || {}
      }
    });
    
    // Create endpoints
    if (projectData.endpoints?.length > 0) {
      const endpointPromises = projectData.endpoints.map(endpoint => 
        prisma.endpoint.create({
          data: {
            ...endpoint,
            projectId: project.id,
            code: '// Generated code\nmodule.exports = async (req, res) => {\n  res.json({ message: "Hello World" });\n};',
            isActive: true,
            isPublic: false
          }
        })
      );
      await Promise.all(endpointPromises);
    }
    
    // Create default environment
    await prisma.environment.create({
      data: {
        name: 'Development',
        variables: {},
        isDefault: true,
        projectId: project.id
      }
    });
    
    // Return full project
    return prisma.project.findUnique({
      where: { id: project.id },
      include: {
        endpoints: true,
        environments: true,
        mockData: true
      }
    });
  }
}

export default new ProjectExportImportService();