import { z } from 'zod';

const Short = z.string().max(200);
const Sentence = z.string().max(4000);

const Device = z.object({
  identifier: Short,
  connectionProperties: z
    .object({
      pairingState: Short.optional(),
      transportType: Short.optional(),
      tunnelState: Short.optional(),
      potentialHostnames: z.array(Short).max(16).optional(),
    })
    .optional(),
  deviceProperties: z
    .object({ name: Short.optional(), osVersionNumber: Short.optional() })
    .optional(),
  hardwareProperties: z
    .object({
      platform: Short.optional(),
      marketingName: Short.optional(),
      productType: Short.optional(),
      udid: Short.optional(),
    })
    .optional(),
});
export type Device = z.infer<typeof Device>;

export const DeviceList = z.object({
  result: z.object({ devices: z.array(Device).max(256) }),
});

export const CommandReport = z.object({
  error: z
    .object({
      userInfo: z
        .object({ NSLocalizedDescription: z.object({ string: Sentence }).optional() })
        .optional(),
    })
    .optional(),
});

export const AppBundleInfo = z.object({
  CFBundleIdentifier: Short,
  DTPlatformName: Short.optional(),
});
