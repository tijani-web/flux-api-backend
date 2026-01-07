import Docker from 'dockerode';
import os from 'os';
import env from '../../config/env.js';

/**
 * PRODUCTION DOCKER CONTAINER MANAGEMENT
 * - Secure container isolation
 * - Resource limiting
 * - Auto cleanup
 * - Health monitoring
 */

class DockerManager {
  constructor() {
    this.docker = new Docker();
    this.activeContainers = new Map();
    this.maxContainers = parseInt(env.app.maxContainers) || 10;
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  // Create execution container
  async createContainer(language = 'node') {
    // Check container limits
    if (this.activeContainers.size >= this.maxContainers) {
      throw new Error('CONTAINER_LIMIT_EXCEEDED');
    }

    const containerConfig = {
      Image: this.getImageForLanguage(language),
      Cmd: ['sleep', '3600'], // Keep container alive for 1 hour
      HostConfig: {
        // Security: No privileged access
        Privileged: false,
        // Resource limits
        Memory: 128 * 1024 * 1024, // 128MB
        MemorySwap: 256 * 1024 * 1024, // 256MB total
        CpuShares: 512, // CPU priority
        // Network isolation
        NetworkMode: 'none', // No network access
        // Read-only filesystem
        ReadonlyRootfs: true,
        // Security options
        SecurityOpt: ['no-new-privileges:true'],
        // Auto remove on exit
        AutoRemove: true
      },
      // Environment variables
      Env: [
        'NODE_ENV=production',
        'MAX_EXECUTION_TIME=5000'
      ],
      // Working directory
      WorkingDir: '/workspace',
      // No TTY
      Tty: false,
      // No STDIN
      OpenStdin: false
    };

    try {
      const container = await this.docker.createContainer(containerConfig);
      await container.start();

      const containerId = container.id;
      this.activeContainers.set(containerId, {
        container,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });

      console.log(`🚀 Container created: ${containerId}`);
      return containerId;

    } catch (error) {
      console.error('❌ Container creation failed:', error);
      throw new Error('CONTAINER_CREATION_FAILED');
    }
  }

  // Execute code in container
 async executeCode(containerId, code, timeout = 5000) {
  const containerData = this.activeContainers.get(containerId);
  if (!containerData) {
    throw new Error('CONTAINER_NOT_FOUND');
  }

  // Update last used
  containerData.lastUsed = Date.now();

  const exec = await containerData.container.exec({
    Cmd: ['node', '-e', this.wrapCode(code)],
    AttachStdout: true,
    AttachStderr: true,
    // Timeout for execution
    timeout: Math.min(timeout, 30000) // Max 30 seconds
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let logs = [];
    let timeoutId;

    // Set execution timeout
    timeoutId = setTimeout(async () => {
      stream.destroy();
      await this.forceStopContainer(containerId);
      reject(new Error('EXECUTION_TIMEOUT'));
    }, timeout);

    // Collect output
    containerData.container.modem.demuxStream(stream, {
      write: (chunk) => stdout += chunk.toString()
    }, {
      write: (chunk) => stderr += chunk.toString()
    });

    stream.on('end', async () => {
      clearTimeout(timeoutId);
      
      try {
        const execInfo = await exec.inspect();
        
        // Parse JSON output
        let output = null;
        let error = null;
        let success = execInfo.ExitCode === 0;
        
        try {
          if (stdout.trim()) {
            const lines = stdout.trim().split('\n');
            
            // Find the JSON line (usually last line)
            let jsonLine = lines[lines.length - 1];
            
            // If last line isn't JSON, look for JSON in any line
            if (!jsonLine.trim().startsWith('{') && !jsonLine.trim().startsWith('[')) {
              jsonLine = lines.find(line => 
                line.trim().startsWith('{') || line.trim().startsWith('[')
              ) || jsonLine;
            }
            
            // Parse the JSON
            const parsed = JSON.parse(jsonLine);
            output = parsed.data || parsed;
            logs = parsed.logs || [];
            success = parsed.success !== false;
            if (parsed.error) error = parsed.error;
          }
        } catch (e) {
          // If not JSON, use raw output
          output = stdout.trim();
        }
        
        if (stderr.trim()) {
          try {
            const lines = stderr.trim().split('\n');
            let jsonLine = lines[lines.length - 1];
            
            if (!jsonLine.trim().startsWith('{') && !jsonLine.trim().startsWith('[')) {
              jsonLine = lines.find(line => 
                line.trim().startsWith('{') || line.trim().startsWith('[')
              ) || jsonLine;
            }
            
            const parsedError = JSON.parse(jsonLine);
            success = false;
            error = parsedError.error || stderr.trim();
            logs = parsedError.logs || [];
          } catch (e) {
            error = stderr.trim();
          }
        }
        
        const executionTime = Date.now() - containerData.lastUsed;
        
        resolve({
          success,
          output,
          error,
          logs,
          executionTime,
          exitCode: execInfo.ExitCode
        });
        
      } catch (error) {
        reject(error);
      }
    });

    stream.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

  // Stop and remove container
  async destroyContainer(containerId) {
    const containerData = this.activeContainers.get(containerId);
    if (!containerData) return;

    try {
      await containerData.container.stop({ t: 10 }); // 10 second grace period
      this.activeContainers.delete(containerId);
      console.log(`✅ Container destroyed: ${containerId}`);
    } catch (error) {
      console.error('❌ Container destruction failed:', error);
      // Force remove if normal stop fails
      try {
        await containerData.container.remove({ force: true });
        this.activeContainers.delete(containerId);
      } catch (forceError) {
        console.error('❌ Force container removal failed:', forceError);
      }
    }
  }

  // Force stop container (for timeouts)
  async forceStopContainer(containerId) {
    const containerData = this.activeContainers.get(containerId);
    if (!containerData) return;

    try {
      await containerData.container.kill();
      this.activeContainers.delete(containerId);
    } catch (error) {
      console.error('❌ Force stop failed:', error);
    }
  }

  // Get container status
  async getContainerStatus(containerId) {
    const containerData = this.activeContainers.get(containerId);
    if (!containerData) return 'NOT_FOUND';

    try {
      const info = await containerData.container.inspect();
      return info.State.Status;
    } catch (error) {
      return 'ERROR';
    }
  }

  // System health check
  async healthCheck() {
    try {
      const info = await this.docker.info();
      return {
        status: 'HEALTHY',
        containers: {
          total: this.activeContainers.size,
          max: this.maxContainers,
          systemTotal: info.Containers || 0
        },
        system: {
          memory: Math.round(info.MemTotal / 1024 / 1024) + 'MB',
          cpu: info.NCPU
        }
      };
    } catch (error) {
      return {
        status: 'UNHEALTHY',
        error: error.message
      };
    }
  }

  // Cleanup old containers
  async cleanupOldContainers(maxAge = 3600000) { // 1 hour
    const now = Date.now();
    const toRemove = [];

    for (const [containerId, data] of this.activeContainers) {
      if (now - data.lastUsed > maxAge) {
        toRemove.push(containerId);
      }
    }

    for (const containerId of toRemove) {
      await this.destroyContainer(containerId);
    }

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} old containers`);
    }
  }

  // Start periodic cleanup
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldContainers();
    }, 300000); // Every 5 minutes
  }

  // Get Docker image for language
getImageForLanguage(language) {
  const images = {
    node: 'node:18-alpine',
    python: 'python:3.9-alpine',
  };

  return images[language] || images.node;
}

  // Wrap user code in safe execution context
wrapCode(code) {
  return `
    const logs = [];
    
    // Override console.log to capture logs
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    
    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      logs.push({ type: 'log', message, timestamp: new Date().toISOString() });
      originalConsoleLog(...args);
    };
    
    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      logs.push({ type: 'error', message, timestamp: new Date().toISOString() });
      originalConsoleError(...args);
    };
    
    try {
      // Execute user code
      const result = (function() {
        ${code}
      })();
      
      // Output result with logs
      console.log(JSON.stringify({
        success: true,
        data: result,
        logs: logs
      }));
      
    } catch (error) {
      // Output error with logs
      console.error(JSON.stringify({
        success: false,
        error: error.message,
        logs: logs
      }));
      process.exit(1);
    }
  `;
}
}

export default new DockerManager();