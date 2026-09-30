import { Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Collapsible } from '@/components/collapsible';
import { Steps } from '@/components/steps';
import { openExternalUrl } from '@/lib/open-external-url';
import { TAMPERMONKEY_URL } from '@/lib/providers/external-urls';
import { LETTERBOXD_SIGN_IN_URL } from '@/lib/providers/letterboxd/config';
import { useLetterboxdUserscript } from '@/lib/providers/letterboxd/userscript-bridge';

export function LetterboxdAdvancedSetup() {
  const detected = useLetterboxdUserscript();

  return (
    <View className="mt-5">
      <Collapsible label="Advanced setup: web logging">
        <View className="gap-4">
          <Text className="text-muted font-sans text-sm">
            Experimental and optional. Log films from Shinobu using Tampermonkey
            and your signed-in Letterboxd browser session. Your cookies stay in
            Letterboxd. This is not an official API integration.
          </Text>
          <Text accessibilityLiveRegion="polite" className="text-foreground font-sans-semibold text-sm">
            {detected ? 'Script detected in this tab' : 'Script not detected in this tab'}
          </Text>
          <Steps>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Install Tampermonkey in this browser. Enable userscript execution
                if your browser asks for it.
              </Text>
              <Button
                icon={<Button.Icon name="open-outline" />}
                label="Get Tampermonkey"
                onPress={() => void openExternalUrl(TAMPERMONKEY_URL)}
                size="sm"
                variant="quiet"
              />
            </Steps.Item>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Install the Shinobu script and allow it on Shinobu and Letterboxd.
                If the link shows source code, paste it into a new Tampermonkey
                script and save. Then reload this Shinobu tab.
              </Text>
              <Button
                icon={<Button.Icon name="open-outline" />}
                label="Install Letterboxd script"
                onPress={() => void openExternalUrl(new URL('/letterboxd.user.js', window.location.origin).href)}
                size="sm"
                variant="quiet"
              />
            </Steps.Item>
            <Steps.Item>
              <Text className="text-muted font-sans text-sm">
                Sign into Letterboxd as the same username connected here. Once
                the script is detected, select Letterboxd under Write to and
                use Mark as watched as usual.
              </Text>
              <Button
                icon={<Button.Icon name="open-outline" />}
                label="Sign into Letterboxd"
                onPress={() => void openExternalUrl(LETTERBOXD_SIGN_IN_URL)}
                size="sm"
                variant="quiet"
              />
            </Steps.Item>
          </Steps>
          <Text className="text-muted font-sans text-sm">
            Logging opens a Letterboxd tab. If it stays open or does not return
            you here, switch back to your original Shinobu tab to see the result.
            If the result is uncertain, check Letterboxd before retrying.
          </Text>
          <Text className="text-muted font-sans text-sm">
            Web watchlist changes still need to be made on Letterboxd. Without
            the script, Shinobu keeps the manual-log link. You can disable the
            script in Tampermonkey and reload Shinobu to return to that mode.
          </Text>
        </View>
      </Collapsible>
    </View>
  );
}
