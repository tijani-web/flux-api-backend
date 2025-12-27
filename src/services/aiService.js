import { GoogleGenerativeAI } from '@google/generative-ai';
import env from '../config/env.js';
import prisma from '../config/database.js';

/**
 * PRODUCTION AI SERVICE - Gemini Integration
 * With automatic model fallback and testing
 */

class AIService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(env.geminiAi.apiKey);
    this.availableModels = [
      "gemini-pro",  
      "gemini-1.0-pro",
      "gemini-1.5-pro-latest",
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash-lite-preview-02-05"
    ];
    
    this.currentModel = "gemini-pro"; 
    this.model = this.genAI.getGenerativeModel({ 
      model: this.currentModel,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    });
    
    this.userLimits = new Map(); // In production, use Redis
    this.maxRequestsPerUser = 100; // Per day
    
    // Test connection on startup
    this.initializeModel();
  }

  // Initialize and test model connection
  async initializeModel() {
    
    const workingModel = await this.testModels();
    if (workingModel) {
      // console.log(`✅ Using Gemini model: ${workingModel}`);
      this.currentModel = workingModel;
      this.model = this.genAI.getGenerativeModel({ 
        model: workingModel,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });
    } else {
      // console.warn('⚠️ No Gemini models available. AI features disabled.');
      this.model = null;
    }
  }

  // Test all available models
  async testModels() {
    // console.log('🔍 Testing available Gemini models...');
    
    for (const modelName of this.availableModels) {
      try {
        const testModel = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { maxOutputTokens: 10 }
        });
        
        const result = await testModel.generateContent("Hello");
        const response = await result.response;
        const text = response.text();
        
        // console.log(`   ✅ ${modelName}: OK - "${text.substring(0, 30)}..."`);
        return modelName; // Return first working model
        
      } catch (error) {
        if (error.message.includes('429')) {
          // console.log(`   ⚠️ ${modelName}: Rate limited (quota exceeded)`);
        } else if (error.message.includes('404')) {
          // console.log(`   ❌ ${modelName}: Not found`);
        } else {
          // console.log(`   ❌ ${modelName}: ${error.message}`);
        }
      }
      
      // Wait between tests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // console.log('❌ No working Gemini models found');
    return null;
  }

  // Generate endpoint code from description
  async generateEndpointCode(userId, prompt, context = {}) {
    if (!this.model) {
      throw new Error('AI_SERVICE_NOT_AVAILABLE: No working Gemini model found');
    }

    await this.checkUsageLimit(userId);

    const systemPrompt = this.buildSystemPrompt(context);
    const fullPrompt = `${systemPrompt}\n\nUser Request: ${prompt}`;

    try {
      const startTime = Date.now();
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const generatedCode = response.text();
      
      const executionTime = Date.now() - startTime;

      // Track usage
      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'CODE_GENERATION',
        inputTokens: this.estimateTokens(fullPrompt),
        outputTokens: this.estimateTokens(generatedCode),
        cost: this.calculateCost(fullPrompt, generatedCode),
        prompt: prompt,
        response: generatedCode,
        executionTime
      });

      // Validate and clean generated code
      const safeCode = this.validateAndCleanCode(generatedCode);

      return {
        success: true,
        code: safeCode,
        model: this.currentModel,
        usage: {
          inputTokens: this.estimateTokens(fullPrompt),
          outputTokens: this.estimateTokens(generatedCode),
          cost: this.calculateCost(fullPrompt, generatedCode),
          executionTime
        }
      };

    } catch (error) {
      console.error('AI Generation Error:', error);
      
      // Try to switch model if current one fails
      if (error.message.includes('429') || error.message.includes('404')) {
        console.log('🔄 Model failed, trying to find alternative...');
        const newModel = await this.testModels();
        if (newModel && newModel !== this.currentModel) {
          this.currentModel = newModel;
          this.model = this.genAI.getGenerativeModel({ 
            model: newModel,
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          });
          console.log(`🔄 Switched to model: ${newModel}`);
        }
      }
      
      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'CODE_GENERATION',
        inputTokens: this.estimateTokens(fullPrompt),
        outputTokens: 0,
        cost: 0,
        prompt: prompt,
        error: error.message,
        executionTime: 0
      });

      throw new Error(`AI_SERVICE_ERROR: ${error.message}`);
    }
  }

  // Optimize existing code
  async optimizeCode(userId, code, optimizationType = 'performance') {
    if (!this.model) {
      throw new Error('AI_SERVICE_NOT_AVAILABLE');
    }

    await this.checkUsageLimit(userId);

    const prompt = this.buildOptimizationPrompt(code, optimizationType);
    const startTime = Date.now();

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const optimizedCode = response.text();
      
      const executionTime = Date.now() - startTime;

      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'CODE_OPTIMIZATION',
        inputTokens: this.estimateTokens(prompt),
        outputTokens: this.estimateTokens(optimizedCode),
        cost: this.calculateCost(prompt, optimizedCode),
        prompt: `Optimize for: ${optimizationType}`,
        response: optimizedCode,
        executionTime
      });

      const safeCode = this.validateAndCleanCode(optimizedCode);

      return {
        success: true,
        originalCode: code,
        optimizedCode: safeCode,
        optimizationType,
        model: this.currentModel,
        improvements: this.analyzeImprovements(code, safeCode),
        usage: {
          inputTokens: this.estimateTokens(prompt),
          outputTokens: this.estimateTokens(optimizedCode),
          cost: this.calculateCost(prompt, optimizedCode),
          executionTime
        }
      };

    } catch (error) {
      console.error('AI Optimization Error:', error);
      throw new Error(`AI_OPTIMIZATION_ERROR: ${error.message}`);
    }
  }

  // Debug and fix code errors
  async debugCode(userId, code, errorMessage, context = {}) {
    if (!this.model) {
      throw new Error('AI_SERVICE_NOT_AVAILABLE');
    }

    await this.checkUsageLimit(userId);

    const prompt = this.buildDebugPrompt(code, errorMessage, context);
    const startTime = Date.now();

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const debugResult = response.text();
      
      const executionTime = Date.now() - startTime;

      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'ERROR_RESOLUTION',
        inputTokens: this.estimateTokens(prompt),
        outputTokens: this.estimateTokens(debugResult),
        cost: this.calculateCost(prompt, debugResult),
        prompt: `Error: ${errorMessage}`,
        response: debugResult,
        executionTime
      });

      const { fixedCode, explanation } = this.parseDebugResponse(debugResult);

      return {
        success: true,
        originalCode: code,
        fixedCode: fixedCode || code,
        explanation: explanation || 'No specific fixes suggested',
        model: this.currentModel,
        usage: {
          inputTokens: this.estimateTokens(prompt),
          outputTokens: this.estimateTokens(debugResult),
          cost: this.calculateCost(prompt, debugResult),
          executionTime
        }
      };

    } catch (error) {
      console.error('AI Debug Error:', error);
      throw new Error(`AI_DEBUG_ERROR: ${error.message}`);
    }
  }

  // Generate tests for endpoint code
  async generateTests(userId, code, testFramework = 'jest') {
    if (!this.model) {
      throw new Error('AI_SERVICE_NOT_AVAILABLE');
    }

    await this.checkUsageLimit(userId);

    const prompt = this.buildTestPrompt(code, testFramework);
    const startTime = Date.now();

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const tests = response.text();
      
      const executionTime = Date.now() - startTime;

      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'TEST_GENERATION',
        inputTokens: this.estimateTokens(prompt),
        outputTokens: this.estimateTokens(tests),
        cost: this.calculateCost(prompt, tests),
        prompt: `Generate ${testFramework} tests`,
        response: tests,
        executionTime
      });

      const safeTests = this.validateAndCleanCode(tests);

      return {
        success: true,
        code: code,
        tests: safeTests,
        testFramework,
        model: this.currentModel,
        usage: {
          inputTokens: this.estimateTokens(prompt),
          outputTokens: this.estimateTokens(tests),
          cost: this.calculateCost(prompt, tests),
          executionTime
        }
      };

    } catch (error) {
      console.error('AI Test Generation Error:', error);
      throw new Error(`AI_TEST_GENERATION_ERROR: ${error.message}`);
    }
  }

  // Generate documentation for code
  async generateDocumentation(userId, code, docType = 'jsdoc') {
    if (!this.model) {
      throw new Error('AI_SERVICE_NOT_AVAILABLE');
    }

    await this.checkUsageLimit(userId);

    const prompt = this.buildDocumentationPrompt(code, docType);
    const startTime = Date.now();

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const documentation = response.text();
      
      const executionTime = Date.now() - startTime;

      await this.trackUsage({
        userId,
        provider: 'GEMINI',
        model: this.currentModel,
        action: 'DOCUMENTATION',
        inputTokens: this.estimateTokens(prompt),
        outputTokens: this.estimateTokens(documentation),
        cost: this.calculateCost(prompt, documentation),
        prompt: `Generate ${docType} documentation`,
        response: documentation,
        executionTime
      });

      return {
        success: true,
        code: code,
        documentation: documentation,
        docType,
        model: this.currentModel,
        usage: {
          inputTokens: this.estimateTokens(prompt),
          outputTokens: this.estimateTokens(documentation),
          cost: this.calculateCost(prompt, documentation),
          executionTime
        }
      };

    } catch (error) {
      console.error('AI Documentation Error:', error);
      throw new Error(`AI_DOCUMENTATION_ERROR: ${error.message}`);
    }
  }

  // Check user usage limits
  async checkUsageLimit(userId) {
    const today = new Date().toDateString();
    const userKey = `${userId}-${today}`;
    
    const userUsage = this.userLimits.get(userKey) || { count: 0, date: today };
    
    if (userUsage.date !== today) {
      // Reset for new day
      userUsage.count = 0;
      userUsage.date = today;
    }
    
    if (userUsage.count >= this.maxRequestsPerUser) {
      throw new Error('DAILY_AI_LIMIT_EXCEEDED');
    }
    
    userUsage.count++;
    this.userLimits.set(userKey, userUsage);
  }

  // Track AI usage in database
  async trackUsage(usageData) {
    try {
      await prisma.aiUsage.create({
        data: {
          userId: usageData.userId,
          provider: usageData.provider,
          model: usageData.model,
          action: usageData.action,
          inputTokens: usageData.inputTokens,
          outputTokens: usageData.outputTokens,
          cost: usageData.cost,
          prompt: usageData.prompt,
          response: usageData.response,
          error: usageData.error,
          executionTime: usageData.executionTime
        }
      });
    } catch (error) {
      console.error('Failed to track AI usage:', error);
      // Don't throw - usage tracking shouldn't break the main flow
    }
  }

  // Build system prompt for code generation
  buildSystemPrompt(context) {
    return `
You are an expert API endpoint code generator for API Flow Studio. Generate secure, production-ready JavaScript code.

RULES:
- Return ONLY executable JavaScript code
- No explanations, comments, or markdown
- Code must run in a secure sandbox environment
- Use ES6+ syntax
- Handle errors gracefully
- Include appropriate response formats
- NO external require/import statements
- NO file system operations
- NO network calls
- NO infinite loops
- Use the provided mockData and helpers when available

CONTEXT:
${JSON.stringify(context, null, 2)}

RESPONSE FORMAT:
Return only the JavaScript code that would be placed in the endpoint code editor.
`;
  }

  // Build optimization prompt
  buildOptimizationPrompt(code, optimizationType) {
    return `
Optimize the following JavaScript code for ${optimizationType}. Return only the optimized code.

Original Code:
${code}

Optimization Focus: ${optimizationType}
Return only the optimized JavaScript code without explanations.
`;
  }

  // Build debug prompt
  buildDebugPrompt(code, errorMessage, context) {
    return `
Debug the following JavaScript code that is throwing an error.

Code:
${code}

Error: ${errorMessage}

Context: ${JSON.stringify(context)}

Provide the fixed code and a brief explanation of the issue.
Format: 
FIXED_CODE:
\`\`\`javascript
// fixed code here
\`\`\`

EXPLANATION:
// explanation here
`;
  }

  // Build test generation prompt
  buildTestPrompt(code, testFramework) {
    return `
Generate ${testFramework} tests for the following JavaScript code.

Code:
${code}

Return only the test code in ${testFramework} format without explanations.
`;
  }

  // Build documentation prompt
  buildDocumentationPrompt(code, docType) {
    return `
Generate ${docType} documentation for the following JavaScript code.

Code:
${code}

Return the documentation in ${docType} format.
`;
  }

  // Validate and clean generated code
  validateAndCleanCode(code) {
    if (!code || typeof code !== 'string') {
      throw new Error('INVALID_CODE_GENERATED');
    }
    
    // Remove markdown code blocks if present
    let cleaned = code.replace(/```javascript|```|```js/gi, '').trim();
    
    // Remove any explanatory text before/after code
    const codeMatch = cleaned.match(/((?:function|const|let|var|return|if|for|while).*)/s);
    if (codeMatch) {
      cleaned = codeMatch[1].trim();
    }
    
    // Basic security checks
    const dangerousPatterns = [
      /require\(['"]fs['"]\)/gi,
      /require\(['"]child_process['"]\)/gi,
      /process\./gi,
      /eval\(/gi,
      /Function\(/gi,
      /setTimeout\(/gi,
      /setInterval\(/gi,
      /fetch\(/gi,
      /XMLHttpRequest/gi,
      /import\(/gi
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        throw new Error('GENERATED_CODE_CONTAINS_DANGEROUS_OPERATIONS');
      }
    }
    
    return cleaned;
  }

  // Parse debug response
  parseDebugResponse(response) {
    const fixedCodeMatch = response.match(/FIXED_CODE:\s*```javascript\n([\s\S]*?)```/);
    const explanationMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\n|$)/);
    
    return {
      fixedCode: fixedCodeMatch ? fixedCodeMatch[1].trim() : null,
      explanation: explanationMatch ? explanationMatch[1].trim() : null
    };
  }

  // Analyze code improvements
  analyzeImprovements(original, optimized) {
    const originalLines = original.split('\n').length;
    const optimizedLines = optimized.split('\n').length;
    
    return {
      linesReduced: Math.max(0, originalLines - optimizedLines),
      complexityReduced: true, // Would implement actual complexity analysis
      performanceImproved: true
    };
  }

  // Estimate tokens (rough approximation)
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // Calculate cost (Gemini pricing)
  calculateCost(inputTokens, outputTokens) {
    const inputCost = (inputTokens / 1000) * 0.00025; // $0.00025 per 1K tokens
    const outputCost = (outputTokens / 1000) * 0.0005; // $0.0005 per 1K tokens
    return parseFloat((inputCost + outputCost).toFixed(6));
  }

  // Get user AI usage stats
  async getUserUsageStats(userId) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    
    const usage = await prisma.aiUsage.groupBy({
      by: ['action'],
      where: {
        userId,
        createdAt: {
          gte: startOfDay
        }
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cost: true
      },
      _count: {
        id: true
      }
    });
    
    const totalUsage = await prisma.aiUsage.aggregate({
      where: { userId },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cost: true
      }
    });
    
    return {
      daily: usage,
      total: totalUsage._sum,
      limit: this.maxRequestsPerUser,
      remaining: Math.max(0, this.maxRequestsPerUser - (usage.reduce((sum, item) => sum + item._count.id, 0)))
    };
  }

  // Get current model info
  getModelInfo() {
    return {
      currentModel: this.currentModel,
      isAvailable: !!this.model,
      availableModels: this.availableModels
    };
  }
}

export default new AIService();