import { Resend } from 'resend';
import env from '../config/env.js';

class EmailService {
  constructor() {
    this.resend = new Resend(env.resendEmail.apiKey);
  }

  // Send welcome email
  async sendWelcomeEmail(to, name) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'API Flow Studio <onboarding@basittijani.com>',
        to,
        subject: `✨ Welcome to API Flow Studio, ${name}!`,
        html: this.getWelcomeTemplate(name)
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      throw error;
    }
  }

  // Send password reset email
  async sendPasswordResetEmail(to, name, resetToken) {
    try {
      const resetUrl = `${env.app.frontendUrl}/reset-password?token=${resetToken}`;

      const { data, error } = await this.resend.emails.send({
        from: 'API Flow Studio <security@basittijani.com>',
        to,
        subject: '🔒 Reset Your API Flow Studio Password',
        html: this.getPasswordResetTemplate(name, resetUrl)
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  // Send collaboration invite email
  async sendCollaborationInvite(to, inviterName, projectName, inviteToken) {
    try {
      const inviteUrl = `${env.app.frontendUrl}/invite/${inviteToken}`;

      const { data, error } = await this.resend.emails.send({
        from: 'API Flow Studio <collaboration@basittijani.com>',
        to,
        subject: `🤝 ${inviterName} invited you to collaborate on "${projectName}"`,
        html: this.getCollaborationInviteTemplate(inviterName, projectName, inviteUrl)
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to send collaboration invite:', error);
      throw error;
    }
  }

  // Send welcome to project email
  async sendWelcomeToProjectEmail(to, userName, projectName, projectUrl) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'API Flow Studio <team@basittijani.com>',
        to,
        subject: `🎉 Welcome to "${projectName}" project!`,
        html: this.getWelcomeToProjectTemplate(userName, projectName, projectUrl)
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to send welcome to project email:', error);
      throw error;
    }
  }

  // ===== GLASS MORPHISM DARK THEME TEMPLATES =====

  getBaseTemplate(content, title) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.7;
              color: #e2e8f0;
              background: linear-gradient(135deg, #0f0a1f 0%, #1a1b3a 100%);
              min-height: 100vh;
              padding: 40px 20px;
              position: relative;
            }
            
            body::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: 
                radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, rgba(167, 139, 250, 0.1) 0%, transparent 50%);
              z-index: -1;
            }
            
            .container {
              max-width: 600px;
              margin: 0 auto;
            }
            
            .glass-card {
              background: rgba(30, 31, 59, 0.7);
              backdrop-filter: blur(20px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 24px;
              overflow: hidden;
              box-shadow: 
                0 20px 60px rgba(0, 0, 0, 0.3),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            }
            
            .glass-header {
              background: linear-gradient(135deg, rgba(109, 40, 217, 0.2) 0%, rgba(67, 56, 202, 0.2) 100%);
              padding: 40px 30px;
              text-align: center;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              position: relative;
              overflow: hidden;
            }
            
            .glass-header::before {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              right: -50%;
              bottom: -50%;
              background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.1) 50%, transparent 70%);
              animation: shimmer 3s infinite linear;
            }
            
            @keyframes shimmer {
              0% { transform: translateX(-100%) rotate(45deg); }
              100% { transform: translateX(100%) rotate(45deg); }
            }
            
            .logo {
              font-size: 32px;
              font-weight: 800;
              background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 12px;
              letter-spacing: -0.5px;
            }
            
            .header-title {
              font-size: 28px;
              font-weight: 700;
              color: #ffffff;
              margin-bottom: 8px;
            }
            
            .header-subtitle {
              font-size: 16px;
              color: #94a3b8;
              font-weight: 400;
            }
            
            .content {
              padding: 40px 30px;
              background: rgba(23, 25, 51, 0.5);
            }
            
            .greeting {
              font-size: 20px;
              font-weight: 600;
              color: #ffffff;
              margin-bottom: 24px;
            }
            
            .message {
              color: #cbd5e1;
              margin-bottom: 30px;
              font-size: 16px;
            }
            
            .features {
              background: rgba(30, 41, 59, 0.4);
              border-radius: 16px;
              padding: 24px;
              margin: 30px 0;
              border: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .feature-item {
              display: flex;
              align-items: center;
              margin-bottom: 12px;
              color: #e2e8f0;
              font-size: 15px;
            }
            
            .feature-item:last-child {
              margin-bottom: 0;
            }
            
            .feature-icon {
              width: 20px;
              height: 20px;
              margin-right: 12px;
              color: #a855f7;
            }
            
            .primary-button {
              display: inline-block;
              background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
              color: white;
              padding: 18px 40px;
              text-decoration: none;
              border-radius: 14px;
              font-weight: 600;
              font-size: 16px;
              text-align: center;
              border: none;
              cursor: pointer;
              transition: all 0.3s ease;
              box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
              position: relative;
              overflow: hidden;
              margin: 20px 0;
            }
            
            .primary-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 12px 40px rgba(99, 102, 241, 0.4);
            }
            
            .primary-button::after {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
              transition: left 0.6s;
            }
            
            .primary-button:hover::after {
              left: 100%;
            }
            
            .secondary-button {
              display: inline-block;
              background: rgba(30, 41, 59, 0.6);
              color: #cbd5e1;
              padding: 14px 28px;
              text-decoration: none;
              border-radius: 12px;
              font-weight: 500;
              font-size: 14px;
              border: 1px solid rgba(255, 255, 255, 0.1);
              transition: all 0.3s ease;
            }
            
            .secondary-button:hover {
              background: rgba(30, 41, 59, 0.8);
              border-color: rgba(255, 255, 255, 0.2);
            }
            
            .footer {
              text-align: center;
              padding: 30px;
              border-top: 1px solid rgba(255, 255, 255, 0.1);
              background: rgba(15, 23, 42, 0.5);
              color: #94a3b8;
              font-size: 14px;
            }
            
            .footer a {
              color: #a855f7;
              text-decoration: none;
            }
            
            .footer a:hover {
              text-decoration: underline;
            }
            
            .alert {
              background: rgba(220, 38, 38, 0.1);
              border: 1px solid rgba(220, 38, 38, 0.3);
              border-radius: 12px;
              padding: 16px;
              margin: 20px 0;
              color: #fecaca;
              font-size: 14px;
            }
            
            .badge {
              display: inline-block;
              background: rgba(168, 85, 247, 0.2);
              color: #c4b5fd;
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              margin: 0 4px;
            }
            
            @media (max-width: 640px) {
              body {
                padding: 20px 16px;
              }
              
              .glass-header {
                padding: 30px 20px;
              }
              
              .content {
                padding: 30px 20px;
              }
              
              .header-title {
                font-size: 24px;
              }
              
              .primary-button {
                padding: 16px 32px;
                width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${content}
          </div>
        </body>
      </html>
    `;
  }

  getWelcomeTemplate(name) {
    return this.getBaseTemplate(`
      <div class="glass-card">
        <div class="glass-header">
          <div class="logo">🚀 API Flow Studio</div>
          <h1 class="header-title">Welcome to the Future of API Development</h1>
          <p class="header-subtitle">Build, test, and collaborate on APIs effortlessly</p>
        </div>
        
        <div class="content">
          <h2 class="greeting">Hey ${name}, welcome aboard! 👋</h2>
          
          <p class="message">
            We're thrilled to have you join our community of developers building amazing APIs. 
            Get ready to experience the most intuitive API development platform.
          </p>
          
          <div class="features">
            <div class="feature-item">
              <span class="feature-icon">⚡</span> Real-time collaborative editing
            </div>
            <div class="feature-item">
              <span class="feature-icon">🤖</span> AI-powered code generation
            </div>
            <div class="feature-item">
              <span class="feature-icon">🔧</span> Visual endpoint builder
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span> Advanced analytics & monitoring
            </div>
            <div class="feature-item">
              <span class="feature-icon">🌐</span> Automatic documentation
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${env.app.frontendUrl}/dashboard" class="primary-button">
              Launch Your Dashboard
            </a>
          </div>
          
          <p class="message">
            Need help getting started? Check out our 
            <a href="${env.app.frontendUrl}/docs" style="color: #a855f7;">documentation</a> 
            or join our community Discord!
          </p>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} API Flow Studio. All rights reserved.</p>
          <p>
            <a href="${env.app.frontendUrl}/privacy">Privacy Policy</a> • 
            <a href="${env.app.frontendUrl}/terms">Terms of Service</a> • 
            <a href="${env.app.frontendUrl}/support">Support</a>
          </p>
        </div>
      </div>
    `, 'Welcome');
  }

  getPasswordResetTemplate(name, resetUrl) {
    return this.getBaseTemplate(`
      <div class="glass-card">
        <div class="glass-header">
          <div class="logo">🔒 API Flow Studio</div>
          <h1 class="header-title">Secure Your Account</h1>
          <p class="header-subtitle">Password Reset Request</p>
        </div>
        
        <div class="content">
          <h2 class="greeting">Hi ${name},</h2>
          
          <p class="message">
            We received a request to reset your password. Click the button below to create a new password.
            This link is valid for <strong>1 hour</strong>.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" class="primary-button">
              Reset Your Password
            </a>
          </div>
          
          <div class="alert">
            ⚠️ If you didn't request this password reset, please ignore this email. 
            Your account remains secure, but you might want to review your account activity.
          </div>
          
          <p class="message">
            Stay secure,<br>
            The API Flow Studio Security Team
          </p>
        </div>
        
        <div class="footer">
          <p>For security reasons, this link expires in 1 hour.</p>
          <p>
            Need help? <a href="${env.app.frontendUrl}/support">Contact Support</a>
          </p>
        </div>
      </div>
    `, 'Password Reset');
  }

  getCollaborationInviteTemplate(inviterName, projectName, inviteUrl) {
    return this.getBaseTemplate(`
      <div class="glass-card">
        <div class="glass-header">
          <div class="logo">🤝 API Flow Studio</div>
          <h1 class="header-title">Collaboration Invitation</h1>
          <p class="header-subtitle">You've been invited to join a project</p>
        </div>
        
        <div class="content">
          <h2 class="greeting">You're Invited! 🎉</h2>
          
          <p class="message">
            <strong style="color: #a855f7;">${inviterName}</strong> has invited you to collaborate on:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="
              background: rgba(30, 41, 59, 0.4);
              border-radius: 16px;
              padding: 24px;
              border: 2px solid rgba(168, 85, 247, 0.3);
              display: inline-block;
            ">
              <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">
                ${projectName}
              </div>
              <div style="color: #94a3b8; font-size: 14px;">
                Project Collaboration
              </div>
            </div>
          </div>
          
          <p class="message">
            Join the team to build APIs together with real-time collaboration, 
            shared endpoints, and seamless integration workflows.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" class="primary-button">
              Accept Invitation & Join Project
            </a>
          </div>
          
          <div class="features">
            <div class="feature-item">
              <span class="feature-icon">👥</span> Real-time collaborative editing
            </div>
            <div class="feature-item">
              <span class="feature-icon">💬</span> Live chat and comments
            </div>
            <div class="feature-item">
              <span class="feature-icon">🚀</span> Instant API testing
            </div>
            <div class="feature-item">
              <span class="feature-icon">📈</span> Shared analytics and logs
            </div>
          </div>
          
          <p class="message">
            Looking forward to building amazing things together!<br>
            The API Flow Studio Team
          </p>
        </div>
        
        <div class="footer">
          <p>This invitation expires in 7 days. Not expecting this? <a href="${env.app.frontendUrl}/support">Contact us</a></p>
          <p>Already have an account? Click the link above to join immediately.</p>
        </div>
      </div>
    `, 'Collaboration Invite');
  }

  getWelcomeToProjectTemplate(userName, projectName, projectUrl) {
    return this.getBaseTemplate(`
      <div class="glass-card">
        <div class="glass-header">
          <div class="logo">🎉 API Flow Studio</div>
          <h1 class="header-title">Welcome to the Team!</h1>
          <p class="header-subtitle">You're now a collaborator</p>
        </div>
        
        <div class="content">
          <h2 class="greeting">Welcome aboard, ${userName}! 🚀</h2>
          
          <p class="message">
            Congratulations! You are now officially a collaborator on 
            <strong style="color: #a855f7;">"${projectName}"</strong>.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${projectUrl}" class="primary-button">
              Open Project & Start Collaborating
            </a>
          </div>
          
          <p class="message">Here's what you can do as a collaborator:</p>
          
          <div class="features">
            <div class="feature-item">
              <span class="feature-icon">✏️</span> Edit endpoints in real-time with the team
            </div>
            <div class="feature-item">
              <span class="feature-icon">🧪</span> Test APIs with our built-in sandbox
            </div>
            <div class="feature-item">
              <span class="feature-icon">📊</span> View project analytics and execution logs
            </div>
            <div class="feature-item">
              <span class="feature-icon">👁️</span> See live cursor positions of other collaborators
            </div>
            <div class="feature-item">
              <span class="feature-icon">💬</span> Chat with team members in real-time
            </div>
            <div class="feature-item">
              <span class="feature-icon">🤖</span> Use AI-powered code suggestions
            </div>
          </div>
          
          <p class="message">
            Need help getting started with collaboration? Check out our 
            <a href="${env.app.frontendUrl}/docs/collaboration" style="color: #a855f7;">collaboration guide</a>.
          </p>
          
          <p class="message">
            Happy building!<br>
            The API Flow Studio Team
          </p>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} API Flow Studio. All rights reserved.</p>
          <p>
            <a href="${env.app.frontendUrl}/docs/collaboration">Collaboration Guide</a> • 
            <a href="${env.app.frontendUrl}/support">Help Center</a>
          </p>
        </div>
      </div>
    `, 'Project Welcome');
  }
}

export default new EmailService();