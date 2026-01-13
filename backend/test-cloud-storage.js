const prisma = require('./src/utils/database');

async function testCloudStorage() {
  try {
    // Test raw DB data
    const rawCS = await prisma.cloudStorage.findUnique({ where: { id: 10 } });
    console.log('\n=== RAW DATABASE DATA ===');
    console.log('s3EncryptedCredentials:', rawCS.s3EncryptedCredentials ? rawCS.s3EncryptedCredentials.substring(0, 80) + '...' : 'NULL');
    console.log('s3AccessKeyId (deprecated):', rawCS.s3AccessKeyId || 'NULL');
    console.log('s3SecretAccessKey (deprecated):', rawCS.s3SecretAccessKey ? '***' : 'NULL');
    console.log('s3Region:', rawCS.s3Region || 'NULL');
    console.log('s3Bucket:', rawCS.s3Bucket || 'NULL');

    // Test with model (should decrypt)
    const { cloudStorageModel } = require('./src/models');
    const modelCS = await cloudStorageModel.findById(10);
    console.log('\n=== MODEL DATA (AFTER DECRYPT) ===');
    console.log('accessKeyId:', modelCS.accessKeyId ? modelCS.accessKeyId.substring(0, 8) + '...' : 'NULL');
    console.log('secretAccessKey:', modelCS.secretAccessKey ? '***' + modelCS.secretAccessKey.substring(modelCS.secretAccessKey.length - 4) : 'NULL');
    console.log('region:', modelCS.region || 'NULL');
    console.log('bucket:', modelCS.bucket || 'NULL');

    // Test with backupJob
    const job = await prisma.backupJob.findUnique({
      where: { id: 68 },
      include: { cloudStorage: true }
    });

    console.log('\n=== BACKUP JOB 68 ===');
    console.log('cloudStorageId:', job.cloudStorageId);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCloudStorage();
