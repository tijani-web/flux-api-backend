import vm2 from 'vm2';
import dockerManager from './dockerManager.js';
import prisma from '../../config/database.js';

/**
 * PRODUCTION CODE EXECUTOR SERVICE
 * - Multi-execution strategy (Docker + VM2 fallback)
 * - Performance optimization
 * - Advanced security policies
 * - Execution caching
 */

class CodeExecutor {
  constructor() {
    this.vm = new vm2.NodeVM({
      // Security sandbox configuration
      sandbox: this.createSecureSandbox(),
      timeout: 10000, // 10 seconds max
      eval: false,
      wasm: false,
      fixAsync: true,
      
      // Module restrictions
      require: {
        external: false, // No external modules
        builtin: this.getAllowedModules(), // Only allowed built-in modules
        root: false, // No relative requires
        context: 'sandbox'
      },
      
      // Source code restrictions
      compiler: 'javascript',
      strict: true
    });

    this.executionCache = new Map();
    this.cacheTTL = 30000; // 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60000);
  }

  // Execute code with optimal strategy
  async executeCode(strategy, executionContext) {
    const { code, timeout, memoryLimit, language } = executionContext;
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(code, executionContext);
    
    // Check cache first
    const cachedResult = this.executionCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < this.cacheTTL) {
      return cachedResult.result;
    }

    let result;
    
    try {
      switch (strategy) {
        case 'docker':
          result = await this.executeWithDocker(executionContext);
          break;
          
        case 'vm2':
          result = await this.executeWithVM2(executionContext);
          break;
          
        case 'auto':
        default:
          // Auto-select best strategy based on code complexity
          result = await this.autoExecute(executionContext);
          break;
      }
      
      // Cache successful execution
      if (result.success) {
        this.executionCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('Code execution failed:', error);
      throw error;
    }
  }

  // Auto-select execution strategy
  async autoExecute(executionContext) {
    const { code, language } = executionContext;
    
    // Use Docker for complex operations or specific languages
    const shouldUseDocker = 
      language !== 'javascript' ||
      this.hasComplexOperations(code) ||
      this.hasAsyncOperations(code) ||
      executionContext.requireIsolation;
    
    if (shouldUseDocker && await dockerManager.healthCheck().status === 'HEALTHY') {
      try {
        return await this.executeWithDocker(executionContext);
      } catch (dockerError) {
        console.warn('Docker execution failed, falling back to VM2:', dockerError);
        // Fall back to VM2
      }
    }
    
    return await this.executeWithVM2(executionContext);
  }

  // Execute with Docker container (maximum security)
  async executeWithDocker(executionContext) {
    const { code, timeout, language } = executionContext;
    
    const startTime = Date.now();
    let containerId;
    
    try {
      // Create container
      containerId = await dockerManager.createContainer(language);
      
      // Prepare execution context
      const wrappedCode = this.wrapCodeForDocker(code, executionContext);
      
      // Execute
      const result = await dockerManager.executeCode(containerId, wrappedCode, timeout);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: result.success,
        output: this.parseDockerOutput(result.output),
        error: result.error,
        logs: result.logs || [],
        executionTime,
        strategy: 'docker',
        containerId
      };
      
    } catch (error) {
      throw new Error(`DOCKER_EXECUTION_FAILED: ${error.message}`);
    } finally {
      // Cleanup container
      if (containerId) {
        await dockerManager.destroyContainer(containerId);
      }
    }
  }

  // Execute with VM2 (faster, less secure)
  async executeWithVM2(executionContext) {
    const { code, timeout } = executionContext;
    
    const startTime = Date.now();
    
    try {
      // Prepare execution context
      const script = this.wrapCodeForVM2(code, executionContext);
      
      // Execute in VM
      const result = await this.vm.run(script, 'vm.js');
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        output: result,
        error: null,
        logs: [], // VM2 doesn't capture console logs easily
        executionTime,
        strategy: 'vm2'
      };
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        output: null,
        error: error.message,
        logs: [],
        executionTime,
        strategy: 'vm2'
      };
    }
  }

  // Create secure sandbox environment
  createSecureSandbox() {
    const logs = [];
    
    return {
      // Mock data and environment
      mockData: {},
      environment: {},
      
      // Request context
      request: {},
      
      // Safe console implementation
      console: {
        log: (...args) => {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          logs.push(`LOG: ${message}`);
        },
        error: (...args) => {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          logs.push(`ERROR: ${message}`);
        },
        warn: (...args) => {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          logs.push(`WARN: ${message}`);
        }
      },
      
      // Response helpers
      Response: {
        json: (data, status = 200) => ({ status, data }),
        error: (message, status = 400) => ({ status, error: message }),
        success: (data) => ({ status: 200, data })
      },
      
      // Safe utility functions
      utils: {
        generateId: () => Math.random().toString(36).substr(2, 9),
        generateToken: () => `mock_${Math.random().toString(36).substr(2)}`,
        getTimestamp: () => new Date().toISOString(),
        validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        validateUrl: (url) => {
          try {
            new URL(url);
            return true;
          } catch {
            return false;
          }
        }
      },
      
      // Data manipulation helpers (safe versions)
      dataHelpers: {
        find: (array, predicate) => {
          if (!Array.isArray(array)) return null;
          return array.find(predicate);
        },
        filter: (array, predicate) => {
          if (!Array.isArray(array)) return [];
          return array.filter(predicate);
        },
        map: (array, mapper) => {
          if (!Array.isArray(array)) return [];
          return array.map(mapper);
        },
        sort: (array, comparator) => {
          if (!Array.isArray(array)) return [];
          return [...array].sort(comparator);
        }
      },
      
      // Get logs for this execution
      getLogs: () => [...logs]
    };
  }

  // Get allowed built-in modules
  getAllowedModules() {
    return [
      'path',
      'url',
      'util',
      'crypto', // Limited access
      'buffer',
      'stream',
      'events',
      'assert'
    ];
  }

  // Wrap code for Docker execution
  wrapCodeForDocker(code, context) {
    const { mockData = {}, environment = {}, request = {} } = context;
    
    return `
      const mockData = ${JSON.stringify(mockData)};
      const environment = ${JSON.stringify(environment)};
      const request = ${JSON.stringify(request)};
      
      // Safe helpers
      const Response = {
        json: (data, status = 200) => ({ status, data }),
        error: (message, status = 400) => ({ status, error: message }),
        success: (data) => ({ status: 200, data })
      };
      
      const utils = {
        generateId: () => Math.random().toString(36).substr(2, 9),
        generateToken: () => 'mock_' + Math.random().toString(36).substr(2),
        getTimestamp: () => new Date().toISOString()
      };
      
      const dataHelpers = {
        find: (array, predicate) => Array.isArray(array) ? array.find(predicate) : null,
        filter: (array, predicate) => Array.isArray(array) ? array.filter(predicate) : [],
        map: (array, mapper) => Array.isArray(array) ? array.map(mapper) : []
      };
      
      // User code execution
      try {
        const result = (function() {
          ${code}
        })();
        
        // Ensure response is properly formatted
        if (result && typeof result === 'object' && result.status && result.data) {
          process.stdout.write(JSON.stringify(result));
        } else {
          process.stdout.write(JSON.stringify(Response.success(result)));
        }
        
      } catch (error) {
        process.stderr.write(JSON.stringify(Response.error(error.message, 500)));
      }
    `;
  }

  // Wrap code for VM2 execution
  wrapCodeForVM2(code, context) {
    const { mockData = {}, environment = {}, request = {} } = context;
    
    return `
      // Inject context
      const mockData = ${JSON.stringify(mockData)};
      const environment = ${JSON.stringify(environment)};
      const request = ${JSON.stringify(request)};
      
      // User code
      ${code}
    `;
  }

  // Parse Docker output
  parseDockerOutput(output) {
    if (!output) return null;
    
    try {
      // Try to parse as JSON
      return JSON.parse(output);
    } catch {
      // Return as string if not JSON
      return output;
    }
  }

  // Check if code has complex operations
  hasComplexOperations(code) {
    const complexPatterns = [
      /async\s+function/gi,
      /await\s+/gi,
      /Promise\./gi,
      /setTimeout/gi,
      /setInterval/gi,
      /while\s*\(/gi,
      /for\s*\([^;]*;[^;]*;[^)]*\)/gi, // Complex for loops
      /JSON\.parse/gi,
      /JSON\.stringify/gi,
      /Math\.random/gi
    ];
    
    return complexPatterns.some(pattern => pattern.test(code));
  }

  // Check if code has async operations
  hasAsyncOperations(code) {
    const asyncPatterns = [
      /async/gi,
      /await/gi,
      /Promise/gi,
      /\.then\(/gi,
      /\.catch\(/gi
    ];
    
    return asyncPatterns.some(pattern => pattern.test(code));
  }

  // Generate cache key
  generateCacheKey(code, context) {
    const { mockData, environment, request } = context;
    
    return Buffer.from(
      code + 
      JSON.stringify(mockData) + 
      JSON.stringify(environment) + 
      JSON.stringify(request)
    ).toString('base64');
  }

  // Cleanup expired cache entries
  cleanupCache() {
    const now = Date.now();
    
    for (const [key, value] of this.executionCache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.executionCache.delete(key);
      }
    }
  }

  // Get execution statistics
  getStats() {
    return {
      cacheSize: this.executionCache.size,
      cacheTTL: this.cacheTTL,
      vm2Config: {
        timeout: this.vm.options.timeout,
        allowedModules: this.getAllowedModules().length
      },
      dockerStatus: dockerManager.healthCheck()
    };
  }

  // Validate code before execution
  validateCode(code) {
    const validations = [
      {
        check: () => code.length > 10000,
        error: 'CODE_TOO_LONG'
      },
      {
        check: () => this.hasDangerousOperations(code),
        error: 'DANGEROUS_OPERATIONS_DETECTED'
      },
      {
        check: () => this.hasExcessiveLoops(code),
        error: 'EXCESSIVE_LOOPS_DETECTED'
      },
      {
        check: () => !code.trim(),
        error: 'EMPTY_CODE'
      }
    ];

    for (const validation of validations) {
      if (validation.check()) {
        throw new Error(validation.error);
      }
    }

    return true;
  }

  // Check for dangerous operations
  hasDangerousOperations(code) {
    const dangerousPatterns = [
      /require\(['"`]fs['"`]\)/gi,
      /require\(['"`]child_process['"`]\)/gi,
      /require\(['"`]os['"`]\)/gi,
      /process\.exit/gi,
      /process\.kill/gi,
      /eval\(/gi,
      /Function\(/gi,
      /setTimeout\(/gi,
      /setInterval\(/gi,
      /while\s*\(\s*true\s*\)/gi,
      /for\s*\(\s*;\s*;\s*\)/gi,
      /import\(['"`]fs['"`]\)/gi,
      /import\(['"`]child_process['"`]\)/gi
    ];

    return dangerousPatterns.some(pattern => pattern.test(code));
  }

  // Check for excessive loops
  hasExcessiveLoops(code) {
    const loopPatterns = [/for\s*\(/gi, /while\s*\(/gi];
    const loopCount = loopPatterns.reduce((count, pattern) => {
      return count + (code.match(pattern) || []).length;
    }, 0);

    return loopCount > 5; // More than 5 loops is suspicious
  }

  // Cleanup resources
  destroy() {
    clearInterval(this.cleanupInterval);
    this.executionCache.clear();
  }
}

export default new CodeExecutor();