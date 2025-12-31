/**
 * Tests for Config Handler
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleConfig } from '../src/handlers/config.js';
import { handleSetup } from '../src/handlers/setup.js';
import { ServerState } from '../src/handlers/types.js';

describe('config handler', () => {
  let state: ServerState;

  beforeEach(async () => {
    state = {
      activeProjectType: null,
      activeConfiguration: null,
      loadedRules: [],
      loadedKnowledge: [],
    };
    await handleSetup({ type: 'react-typescript' }, state);
  });

  describe('handleConfig', () => {
    describe('list action', () => {
      it('should list configurations', async () => {
        const response = await handleConfig({ action: 'list' }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data).toHaveProperty('configurations');
        expect(Array.isArray(data.configurations)).toBe(true);
      });

      it('should default to list action', async () => {
        const response = await handleConfig({}, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data).toHaveProperty('configurations');
      });
    });

    describe('save action', () => {
      it('should require name', async () => {
        const response = await handleConfig({ action: 'save' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('name');
      });

      it('should save configuration with name', async () => {
        const response = await handleConfig({ 
          action: 'save', 
          name: 'test-config' 
        }, state);
        const data = JSON.parse(response.content[0].text);
        
        expect(data.success).toBe(true);
        expect(data.name).toBe('test-config');
      });

      it('should require active configuration', async () => {
        const emptyState: ServerState = {
          activeProjectType: null,
          activeConfiguration: null,
          loadedRules: [],
          loadedKnowledge: [],
        };
        
        const response = await handleConfig({ 
          action: 'save', 
          name: 'test' 
        }, emptyState);
        
        expect(response.content[0].text).toContain('No active configuration');
      });
    });

    describe('load action', () => {
      it('should require id', async () => {
        const response = await handleConfig({ action: 'load' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('id');
      });

      it('should return not found for invalid id', async () => {
        const response = await handleConfig({ 
          action: 'load', 
          id: 'nonexistent-config-id' 
        }, state);
        
        expect(response.content[0].text).toContain('not found');
      });
    });

    describe('delete action', () => {
      it('should require id', async () => {
        const response = await handleConfig({ action: 'delete' }, state);
        
        expect(response.content[0].text).toContain('Error');
        expect(response.content[0].text).toContain('id');
      });

      it('should delete configuration', async () => {
        // First save
        await handleConfig({ action: 'save', name: 'to-delete' }, state);
        
        // Then delete (we need the ID from the list)
        const listResponse = await handleConfig({ action: 'list' }, state);
        const listData = JSON.parse(listResponse.content[0].text);
        
        if (listData.configurations.length > 0) {
          const configId = listData.configurations[0].id;
          const deleteResponse = await handleConfig({ 
            action: 'delete', 
            id: configId 
          }, state);
          const deleteData = JSON.parse(deleteResponse.content[0].text);
          
          expect(deleteData.success).toBe(true);
        }
      });
    });

    describe('export action', () => {
      it('should export configuration', async () => {
        // Save first
        const saveResponse = await handleConfig({ 
          action: 'save', 
          name: 'export-test' 
        }, state);
        const saveData = JSON.parse(saveResponse.content[0].text);
        
        const response = await handleConfig({ 
          action: 'export', 
          id: saveData.id 
        }, state);
        
        expect(response).toHaveProperty('content');
      });
    });

    describe('import action', () => {
      it('should import valid JSON configuration', async () => {
        const configJson = JSON.stringify({
          name: 'imported-config',
          projectType: 'react-node',
          selectedRules: [],
          selectedKnowledge: [],
          customRules: []
        });
        
        const response = await handleConfig({ 
          action: 'import', 
          json: configJson 
        }, state);
        
        expect(response).toHaveProperty('content');
      });
    });
  });
});
