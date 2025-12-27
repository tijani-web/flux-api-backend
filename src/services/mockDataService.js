import { faker } from '@faker-js/faker';
import prisma from '../config/database.js';

/**
 * PRODUCTION MOCK DATA SERVICE
 * - Create fake data collections
 * - Generate realistic test data
 * - Manage mock data relationships
 * - Data validation and seeding
 * - REAL SAVE FROM EXECUTION SUPPORT ✅
 */

class MockDataService {
  // Create mock data collection
  async createCollection(projectId, userId, collectionData) {
    const { name, description, schema, initialData } = collectionData;

    // Verify project access
    await this.verifyProjectAccess(projectId, userId);

    // Validate collection name
    this.validateCollectionName(name);

    // Generate initial data if not provided
    const data = initialData || this.generateDataFromSchema(schema) || this.generateDefaultData(name);

    const collection = await prisma.mockDataCollection.create({
      data: {
        projectId,
        name,
        description,
        schema: schema || this.inferSchema(data),
        data,
        metadata: {
          createdBy: userId,
          createdAt: new Date().toISOString(),
          version: 1,
          saveCount: 0
        }
      },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return collection;
  }

  // Get all collections for project
  async getProjectCollections(projectId, userId) {
    await this.verifyProjectAccess(projectId, userId);

    const collections = await prisma.mockDataCollection.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        schema: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        projectId: true,
        isSeedData: true,
        metadata: true
      }
    });

    return collections;
  }

  // Get specific collection
  async getCollection(collectionId, userId) {
    const collection = await prisma.mockDataCollection.findUnique({
      where: { id: collectionId },
      include: {
        project: {
          select: {
            id: true,
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!collection) {
      throw new Error('COLLECTION_NOT_FOUND');
    }

    // Verify access
    await this.verifyProjectAccess(collection.projectId, userId);

    return collection;
  }

  // Get collection for execution (optimized)
  async getCollectionForExecution(collectionId, userId) {
    const collection = await prisma.mockDataCollection.findUnique({
      where: { id: collectionId },
      select: {
        id: true,
        name: true,
        data: true,
        schema: true,
        projectId: true,
        project: {
          select: {
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true, canEdit: true }
            }
          }
        }
      }
    });

    if (!collection) {
      throw new Error('COLLECTION_NOT_FOUND');
    }

    // Verify access
    const hasAccess = 
      collection.project.ownerId === userId ||
      collection.project.collaborators.length > 0;

    if (!hasAccess) {
      throw new Error('COLLECTION_ACCESS_DENIED');
    }

    return {
      id: collection.id,
      name: collection.name,
      data: collection.data || [],
      schema: collection.schema,
      formattedForExecution: {
        [collection.name]: collection.data || []
      }
    };
  }

  // ⭐⭐ NEW: Save mock data from endpoint execution ⭐⭐
  async saveFromExecution(collectionId, data, userId, executionContext = {}) {
    console.log(`💾 [MockDataService] Saving from execution:`, {
      collectionId,
      dataLength: Array.isArray(data) ? data.length : 'not array',
      userId,
      executionContext: {
        endpointId: executionContext.endpointId,
        executionId: executionContext.executionId
      }
    });

    // Get collection with full access check
    const collection = await prisma.mockDataCollection.findUnique({
      where: { id: collectionId },
      include: {
        project: {
          select: {
            id: true,
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true, canEdit: true }
            }
          }
        }
      }
    });

    if (!collection) {
      console.error(`❌ Collection ${collectionId} not found`);
      throw new Error('COLLECTION_NOT_FOUND');
    }

    // Verify user has EDIT access
    const canEdit = 
      collection.project.ownerId === userId ||
      collection.project.collaborators.some(collab => collab.canEdit === true);

    if (!canEdit) {
      console.error(`❌ User ${userId} has no edit access to collection ${collectionId}`);
      throw new Error('COLLECTION_EDIT_ACCESS_DENIED');
    }

    // Validate data
    if (!Array.isArray(data)) {
      console.error(`❌ Data is not an array:`, typeof data);
      throw new Error('DATA_MUST_BE_ARRAY');
    }

    // Validate data structure against schema if exists
    if (collection.schema) {
      const validationResult = this.validateDataAgainstSchema(data, collection.schema);
      if (!validationResult.valid) {
        console.error(`❌ Schema validation failed:`, validationResult.errors);
        throw new Error(`SCHEMA_VALIDATION_FAILED: ${validationResult.errors.join(', ')}`);
      }
    }

    // Create backup before update
    const backup = {
      previousData: collection.data,
      previousVersion: collection._metadata?.version || 1,
      backedUpAt: new Date().toISOString()
    };

    // Update collection with new data
    const currentMetadata = collection.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      version: (currentMetadata.version || 1) + 1,
      saveCount: (currentMetadata.saveCount || 0) + 1,
      lastSavedFromExecution: new Date().toISOString(),
      lastExecutionContext: executionContext,
      lastSavedBy: userId,
      backup: backup
    };

    const updatedCollection = await prisma.mockDataCollection.update({
      where: { id: collectionId },
      data: {
        data: data,
        updatedAt: new Date(),
        metadata: updatedMetadata
      },
      select: {
        id: true,
        name: true,
        data: true,
        updatedAt: true,
        metadata: true
      }
    });

    console.log(`✅ [MockDataService] Saved ${data.length} items to "${collection.name}" (v${updatedMetadata.version})`);

    // Log the save operation
    await this.logSaveOperation({
      collectionId,
      collectionName: collection.name,
      userId,
      operation: 'save_from_execution',
      itemCount: data.length,
      executionContext,
      metadata: {
        previousVersion: backup.previousVersion,
        newVersion: updatedMetadata.version,
        saveCount: updatedMetadata.saveCount
      }
    });

    return {
      success: true,
      message: `Saved ${data.length} items to ${collection.name}`,
      collection: {
        id: updatedCollection.id,
        name: collection.name,
        itemCount: data.length,
        version: updatedMetadata.version,
        updatedAt: updatedCollection.updatedAt
      },
      executionContext,
      metadata: {
        saveCount: updatedMetadata.saveCount,
        version: updatedMetadata.version
      }
    };
  }

  // Update collection data
  async updateCollection(collectionId, userId, updateData) {
    const collection = await this.getCollection(collectionId, userId);

    // If updating data, validate and create backup
    if (updateData.data) {
      if (!Array.isArray(updateData.data)) {
        throw new Error('DATA_MUST_BE_ARRAY');
      }

      // Validate against schema if exists
      if (collection.schema) {
        const validationResult = this.validateDataAgainstSchema(updateData.data, collection.schema);
        if (!validationResult.valid) {
          throw new Error(`SCHEMA_VALIDATION_FAILED: ${validationResult.errors.join(', ')}`);
        }
      }

      // Update metadata
      const currentMetadata = collection.metadata || {};
      updateData.metadata = {
        ...currentMetadata,
        version: (currentMetadata.version || 1) + 1,
        lastManualUpdate: new Date().toISOString(),
        updatedBy: userId
      };
    }

    const updatedCollection = await prisma.mockDataCollection.update({
      where: { id: collectionId },
      data: {
        ...updateData,
        ...(updateData.data && { schema: this.inferSchema(updateData.data) })
      }
    });

    return updatedCollection;
  }

  // Delete collection
  async deleteCollection(collectionId, userId) {
    const collection = await this.getCollection(collectionId, userId);

    await prisma.mockDataCollection.delete({
      where: { id: collectionId }
    });

    return { success: true };
  }

  // Validate data against schema
  validateDataAgainstSchema(data, schema) {
    if (!schema || !schema.items || !schema.items.properties) {
      return { valid: true, errors: [] };
    }

    const errors = [];
    const requiredFields = schema.items.required || [];
    const properties = schema.items.properties;

    data.forEach((item, index) => {
      // Check required fields
      requiredFields.forEach(field => {
        if (item[field] === undefined || item[field] === null) {
          errors.push(`Item ${index} missing required field: ${field}`);
        }
      });

      // Check field types
      Object.entries(item).forEach(([key, value]) => {
        const fieldSchema = properties[key];
        if (fieldSchema) {
          const expectedType = fieldSchema.type;
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          
          if (expectedType && actualType !== expectedType) {
            errors.push(`Item ${index} field "${key}": expected ${expectedType}, got ${actualType}`);
          }
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Generate mock data based on schema
  generateDataFromSchema(schema, count = 10) {
    if (!schema || !schema.properties) return null;

    const data = [];
    
    for (let i = 0; i < count; i++) {
      const item = {};
      
      for (const [key, property] of Object.entries(schema.properties)) {
        item[key] = this.generateFieldValue(property, key);
      }
      
      // Add ID if not specified
      if (!item.id) {
        item.id = i + 1;
      }
      
      data.push(item);
    }

    return data;
  }

  // Generate default data for common collection types
  generateDefaultData(collectionName, count = 10) {
    const generators = {
      users: () => this.generateUsers(count),
      products: () => this.generateProducts(count),
      orders: () => this.generateOrders(count),
      posts: () => this.generatePosts(count),
      categories: () => this.generateCategories(count)
    };

    const generator = generators[collectionName.toLowerCase()] || generators.users;
    return generator();
  }

  // Generate fake users
  generateUsers(count = 10) {
    const users = [];
    
    for (let i = 0; i < count; i++) {
      users.push({
        id: i + 1,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        avatar: faker.image.avatar(),
        role: faker.helpers.arrayElement(['user', 'admin', 'moderator']),
        isActive: faker.datatype.boolean(),
        createdAt: faker.date.past().toISOString(),
        updatedAt: faker.date.recent().toISOString()
      });
    }
    
    return users;
  }

  // Generate fake products
  generateProducts(count = 10) {
    const products = [];
    
    for (let i = 0; i < count; i++) {
      products.push({
        id: i + 1,
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: parseFloat(faker.commerce.price()),
        category: faker.commerce.department(),
        inStock: faker.datatype.boolean(),
        images: [faker.image.url()],
        tags: faker.helpers.arrayElements(['featured', 'new', 'sale'], 2),
        createdAt: faker.date.past().toISOString()
      });
    }
    
    return products;
  }

  // Generate fake orders
  generateOrders(count = 10) {
    const orders = [];
    
    for (let i = 0; i < count; i++) {
      orders.push({
        id: i + 1,
        userId: faker.number.int({ min: 1, max: 10 }),
        productId: faker.number.int({ min: 1, max: 10 }),
        quantity: faker.number.int({ min: 1, max: 5 }),
        total: parseFloat(faker.commerce.price()),
        status: faker.helpers.arrayElement(['pending', 'completed', 'cancelled']),
        createdAt: faker.date.past().toISOString()
      });
    }
    
    return orders;
  }

  // Generate fake blog posts
  generatePosts(count = 10) {
    const posts = [];
    
    for (let i = 0; i < count; i++) {
      posts.push({
        id: i + 1,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraphs(3),
        author: faker.person.fullName(),
        category: faker.helpers.arrayElement(['tech', 'lifestyle', 'business']),
        isPublished: faker.datatype.boolean(),
        views: faker.number.int({ min: 0, max: 1000 }),
        createdAt: faker.date.past().toISOString()
      });
    }
    
    return posts;
  }

  // Generate fake categories
  generateCategories(count = 5) {
    const categories = [];
    const uniqueCategories = new Set();
    
    while (categories.length < count && uniqueCategories.size < 20) {
      const category = faker.commerce.department();
      
      if (!uniqueCategories.has(category)) {
        uniqueCategories.add(category);
        categories.push({
          id: categories.length + 1,
          name: category,
          description: faker.lorem.sentence(),
          isActive: true,
          createdAt: faker.date.past().toISOString()
        });
      }
    }
    
    return categories;
  }

  // Generate field value based on schema property
  generateFieldValue(property, fieldName) {
    const { type, format, enum: enumValues } = property;
    
    // Handle enums first
    if (enumValues && Array.isArray(enumValues)) {
      return faker.helpers.arrayElement(enumValues);
    }
    
    // Handle based on type and common field names
    switch (type) {
      case 'string':
        if (format === 'email') return faker.internet.email();
        if (format === 'date-time') return faker.date.anytime().toISOString();
        if (format === 'uri') return faker.image.url();
        
        // Smart field name detection
        if (fieldName.includes('name')) return faker.person.fullName();
        if (fieldName.includes('email')) return faker.internet.email();
        if (fieldName.includes('phone')) return faker.phone.number();
        if (fieldName.includes('address')) return faker.location.streetAddress();
        if (fieldName.includes('city')) return faker.location.city();
        if (fieldName.includes('country')) return faker.location.country();
        if (fieldName.includes('description')) return faker.lorem.sentence();
        if (fieldName.includes('title')) return faker.lorem.sentence();
        
        return faker.lorem.words(3);
        
      case 'number':
      case 'integer':
        if (fieldName.includes('price') || fieldName.includes('amount')) {
          return parseFloat(faker.commerce.price());
        }
        if (fieldName.includes('age')) {
          return faker.number.int({ min: 18, max: 80 });
        }
        return faker.number.int({ min: 1, max: 1000 });
        
      case 'boolean':
        return faker.datatype.boolean();
        
      case 'array':
        return [];
        
      default:
        return null;
    }
  }

  // Infer schema from data
  inferSchema(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return { type: 'array', items: {} };
    }
    
    const sample = data[0];
    const properties = {};
    const required = [];
    
    for (const [key, value] of Object.entries(sample)) {
      properties[key] = this.inferPropertySchema(value, key);
      required.push(key);
    }
    
    return {
      type: 'array',
      items: {
        type: 'object',
        properties,
        required
      }
    };
  }

  // Infer property schema from value
  inferPropertySchema(value, key) {
    const type = typeof value;
    
    const schema = { type };
    
    if (type === 'string') {
      if (key.includes('email')) schema.format = 'email';
      if (key.includes('date')) schema.format = 'date-time';
      if (key.includes('url') || key.includes('image')) schema.format = 'uri';
    }
    
    if (type === 'number') {
      schema.minimum = 0;
    }
    
    return schema;
  }

  // Validate collection name
  validateCollectionName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('INVALID_COLLECTION_NAME');
    }
    
    if (name.length < 2 || name.length > 50) {
      throw new Error('COLLECTION_NAME_LENGTH_INVALID');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('COLLECTION_NAME_INVALID_CHARACTERS');
    }
    
    return true;
  }

  // Verify project access
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

    if (!project) {
      throw new Error('PROJECT_ACCESS_DENIED');
    }

    return true;
  }

  // Verify collection edit access
  async verifyCollectionEditAccess(collectionId, userId) {
    const collection = await prisma.mockDataCollection.findUnique({
      where: { id: collectionId },
      include: {
        project: {
          select: {
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true, canEdit: true }
            }
          }
        }
      }
    });

    if (!collection) {
      throw new Error('COLLECTION_NOT_FOUND');
    }

    const canEdit = 
      collection.project.ownerId === userId ||
      collection.project.collaborators.some(collab => collab.canEdit === true);

    if (!canEdit) {
      throw new Error('COLLECTION_EDIT_ACCESS_DENIED');
    }

    return true;
  }

  // Search within mock data
  async searchCollection(collectionId, userId, query, filters = {}) {
    const collection = await this.getCollection(collectionId, userId);
    let data = collection.data;

    // Apply text search
    if (query) {
      data = data.filter(item => 
        JSON.stringify(item).toLowerCase().includes(query.toLowerCase())
      );
    }

    // Apply filters
    if (filters && Object.keys(filters).length > 0) {
      data = data.filter(item => {
        return Object.entries(filters).every(([key, value]) => {
          return item[key] == value; // Loose equality for flexibility
        });
      });
    }

    return {
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description
      },
      results: data,
      total: data.length,
      query,
      filters
    };
  }

  // Get collection statistics
  async getCollectionStats(collectionId, userId) {
    const collection = await this.getCollection(collectionId, userId);
    
    if (!Array.isArray(collection.data) || collection.data.length === 0) {
      return {
        totalItems: 0,
        fields: [],
        sampleItem: null
      };
    }
    
    const sample = collection.data[0];
    const fields = Object.keys(sample).map(key => ({
      name: key,
      type: typeof sample[key],
      sampleValue: sample[key]
    }));
    
    return {
      totalItems: collection.data.length,
      fields,
      sampleItem: sample,
      metadata: collection._metadata || {}
    };
  }

  // Log save operation
  async logSaveOperation(logData) {
    try {
      await prisma.mockDataSaveLog.create({
        data: {
          collectionId: logData.collectionId,
          collectionName: logData.collectionName,
          userId: logData.userId,
          operation: logData.operation,
          itemCount: logData.itemCount,
          executionContext: logData.executionContext || {},
          metadata: logData.metadata || {}
        }
      });
    } catch (error) {
      console.error('Failed to log save operation:', error);
      // Don't throw - this shouldn't break the save
    }
  }

  // Get save history for collection
  async getSaveHistory(collectionId, userId, limit = 10) {
    await this.verifyCollectionEditAccess(collectionId, userId);

    const history = await prisma.mockDataSaveLog.findMany({
      where: { collectionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        operation: true,
        itemCount: true,
        executionContext: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return history;
  }

  // Rollback to previous version
  async rollbackCollection(collectionId, userId, version = null) {
    await this.verifyCollectionEditAccess(collectionId, userId);

    const collection = await prisma.mockDataCollection.findUnique({
      where: { id: collectionId },
      select: {
        data: true,
        metadata: true
      }
    });

    if (!collection) {
      throw new Error('COLLECTION_NOT_FOUND');
    }

    // For now, we only have backup in metadata
    // In a real system, you'd have proper versioning
    const backup = collection._metadata?.backup;
    if (!backup || !backup.previousData) {
      throw new Error('NO_BACKUP_AVAILABLE');
    }

    // Restore from backup
    const updatedCollection = await prisma.mockDataCollection.update({
      where: { id: collectionId },
      data: {
        data: backup.previousData,
        updatedAt: new Date(),
          metadata: {
          ...collection.metadata,
          version: (collection.metadata?.version || 1) + 1,
          rolledBackFrom: collection.metadata?.version || 1,
          rolledBackAt: new Date().toISOString(),
          rolledBackBy: userId
        }
      }
    });

    // Log rollback
    await this.logSaveOperation({
      collectionId,
      collectionName: 'Unknown', // Would need to fetch name
      userId,
      operation: 'rollback',
      itemCount: backup.previousData.length,
      metadata: {
        fromVersion: collection.metadata?.version || 1,
        toVersion: backup.previousVersion || 1,
        rolledBackAt: new Date().toISOString()
      }
    });

    return {
      success: true,
      message: `Rolled back to version ${backup.previousVersion || 1}`,
      collection: {
        id: collectionId,
        itemCount: backup.previousData.length,
        version: (collection.metadata?.version || 1) + 1
      }
    };
  }
}

export default new MockDataService();