Pod::Spec.new do |s|
  s.name           = 'AppLanguage'
  s.version        = '1.0.0'
  s.summary        = 'What the app can do with the language iOS keeps for it in Settings'
  s.description    = 'Tells the app that iOS holds its per-app language in Settings, where only the user can change it.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
