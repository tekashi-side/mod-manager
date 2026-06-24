import type { FC } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import type { ChooseFolderResult } from '@shared/api';

const SetupGate: FC = () => {
  const queryClient = useQueryClient();

  const choose = useMutation<ChooseFolderResult>({
    mutationFn: () => window.findias.chooseGameFolder(),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ['setupState'] });
      }
    },
  });

  const result = choose.data;
  const validationError = result && !result.ok && !result.canceled ? result.error : undefined;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h4">Welcome to Findias</Typography>
        <Typography variant="body1" color="text.secondary">
          To get started, choose your Mabinogi game folder. This is the <code>appdata</code> folder
          inside your Mabinogi install — it contains a <code>package</code> subfolder. Findias needs
          this before it can manage mods.
        </Typography>

        {validationError && <Alert severity="error">{validationError}</Alert>}
        {choose.isError && (
          <Alert severity="error">Something went wrong opening the folder picker.</Alert>
        )}

        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => choose.mutate()} disabled={choose.isPending}>
            {choose.isPending ? 'Opening…' : 'Choose game folder'}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Example: D:\Nexon\Library\mabinogi\appdata
        </Typography>
      </Stack>
    </Container>
  );
};

export default SetupGate;
