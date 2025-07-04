// scripts/debug-notion-properties.ts
import { Client } from '@notionhq/client';

const notion = new Client({ 
  auth: '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'
});

async function debugDatabaseProperties() {
  try {
    console.log('🔍 Checking database properties...');
    
    const databaseId = '224d0f0c2544806aba32c82f0d08f463';
    
    // Get database schema
    const database = await notion.databases.retrieve({
      database_id: databaseId
    });
    
    console.log('\n📋 Database Properties:');
    console.log('='.repeat(50));
    
    Object.entries(database.properties).forEach(([name, property]: [string, any]) => {
      console.log(`Property: "${name}"`);
      console.log(`Type: ${property.type}`);
      
      if (property.type === 'select' && property.select?.options) {
        console.log(`Options: ${property.select.options.map((opt: any) => `"${opt.name}"`).join(', ')}`);
      }
      
      console.log('-'.repeat(30));
    });
    
    // Try to get one page to see the structure
    console.log('\n🔍 Getting sample page...');
    const pages = await notion.databases.query({
      database_id: databaseId,
      page_size: 1
    });
    
    if (pages.results.length > 0 && 'properties' in pages.results[0]) {
      console.log('\n📄 Sample Page Properties:');
      console.log('='.repeat(50));
      
      Object.entries(pages.results[0].properties).forEach(([name, property]: [string, any]) => {
        console.log(`"${name}": ${property.type}`);
        if (property.type === 'select' && property.select) {
          console.log(`  Value: "${property.select?.name || 'null'}"`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugDatabaseProperties();