Pod::Spec.new do |s|
  s.name           = 'FocusCard'
  s.version        = '1.0.0'
  s.summary        = 'The system focus effect for a navigator control'
  s.description    = 'The view tvOS focuses for a control the spatial navigator focuses, with the lift, tilt and light of a tvOS card.'
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
