Pod::Spec.new do |s|
  s.name           = 'FocusTilt'
  s.version        = '1.0.0'
  s.summary        = 'The focus parallax for a control the platform does not focus'
  s.description    = 'Tilts a React Native subtree toward the thumb on the Siri Remote touch surface.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
