Pod::Spec.new do |s|
  s.name           = 'VlcPlayer'
  s.version        = '0.1.0'
  s.summary        = 'The libVLC plane: plays what AVFoundation cannot demux or decode'
  s.description    = 'AVFoundation has no Matroska demuxer and decodes neither DTS nor TrueHD, so every such title is a server remux. VLCKit carries its own demuxers and decoders, which lets those direct-play instead.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The tvOS and iOS builds of libVLC are separate pods with the same API surface.
  s.tvos.dependency 'TVVLCKit', '~> 3.7.0'
  s.ios.dependency 'MobileVLCKit', '~> 3.7.0'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
