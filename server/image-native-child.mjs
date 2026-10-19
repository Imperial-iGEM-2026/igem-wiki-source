import { processImage, previewImage } from './image-native.mjs';
// The process exits after each image so native allocations cannot accumulate in
// the long-running server. Losing the parent also ends the native operation.
process.on('disconnect', () => process.exit(1));
process.once('message', async ({ file, options }) => {
  let message;
  try {
    message = {
      result: options.previewSize
        ? await previewImage(file, options.previewSize)
        : await processImage(file, options),
    };
  } catch (error) {
    message = { error: error.message };
  }
  message.peakRssKiB = process.resourceUsage().maxRSS;
  process.send(message, () => process.exit(0));
});
