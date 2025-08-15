// src/services/templates.ts

export interface DocumentationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
  tags: string[];
  is_default: boolean;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
}

export interface TemplatesData {
  templates: DocumentationTemplate[];
  categories: TemplateCategory[];
}

class TemplateService {
  private templatesData: TemplatesData | null = null;

  async loadTemplates(): Promise<TemplatesData> {
    if (this.templatesData) {
      return this.templatesData;
    }

    try {
      const response = await fetch('/documentation-templates.json');
      if (!response.ok) {
        throw new Error(`Failed to load templates: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.templatesData = data;
      return data;
    } catch (error) {
      console.error('Error loading documentation templates:', error);
      // Return empty data structure as fallback
      return {
        templates: [],
        categories: []
      };
    }
  }

  async getTemplates(): Promise<DocumentationTemplate[]> {
    const data = await this.loadTemplates();
    return data.templates;
  }

  async getCategories(): Promise<TemplateCategory[]> {
    const data = await this.loadTemplates();
    return data.categories;
  }

  async getTemplateById(id: string): Promise<DocumentationTemplate | null> {
    const templates = await this.getTemplates();
    return templates.find(template => template.id === id) || null;
  }

  async getTemplatesByCategory(categoryId: string): Promise<DocumentationTemplate[]> {
    const templates = await this.getTemplates();
    return templates.filter(template => template.category === categoryId);
  }

  async getDefaultTemplates(): Promise<DocumentationTemplate[]> {
    const templates = await this.getTemplates();
    return templates.filter(template => template.is_default);
  }

  async searchTemplates(query: string): Promise<DocumentationTemplate[]> {
    const templates = await this.getTemplates();
    const lowerQuery = query.toLowerCase();
    
    return templates.filter(template => 
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }
}

export const templateService = new TemplateService();

// Export individual functions for backward compatibility
export const loadTemplates = templateService.loadTemplates.bind(templateService);
export const getTemplates = templateService.getTemplates.bind(templateService);
export const getCategories = templateService.getCategories.bind(templateService);
export const getTemplateById = templateService.getTemplateById.bind(templateService);
export const getTemplatesByCategory = templateService.getTemplatesByCategory.bind(templateService);
export const getDefaultTemplates = templateService.getDefaultTemplates.bind(templateService);
export const searchTemplates = templateService.searchTemplates.bind(templateService);
