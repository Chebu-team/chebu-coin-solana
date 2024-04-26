
solana-test-validator -r --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metaplex.so 2>&1 >/dev/null &
NODEPID=$!
sleep 5
./cicd.sh
yarn run test
sleep 1
kill $NODEPID
