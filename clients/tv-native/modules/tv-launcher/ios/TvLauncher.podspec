Pod::Spec.new do |s|
  s.name           = 'TvLauncher'
  s.version        = '1.0.0'
  s.summary        = "KROMA's presence on the television's own home screen"
  s.description    = "Hands the app's continue-watching / home-section lists to the platform launcher (Top Shelf on tvOS)"
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
